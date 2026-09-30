// Stage A (M-A2): convert the 22 test-domain construction points to getSharedTestPrisma().
// Idempotent: skips files that already reference getSharedTestPrisma. Run from worktree root.
import { readFileSync, writeFileSync } from 'node:fs';

const HELPER_IMPORT = "import { getSharedTestPrisma } from './helpers/create-test-prisma.js';";

const EAGER = [
  'tests/admin-delete.test.ts',
  'tests/admin-templates-extra.test.ts',
  'tests/admin-tree.test.ts',
  'tests/analysis-api.test.ts',
  'tests/batch-aggregate-api.test.ts',
  'tests/audit-cleanup.service.test.ts',
  'tests/batch-import.test.ts',
  'tests/dead-letter.test.ts',
  'tests/interview-plan-members-phone.test.ts',
  'tests/interview-repository.test.ts',
  'tests/message-repository.test.ts',
  'tests/plans-api.test.ts',
  'tests/report-api.test.ts',
  'tests/schema-analysis-dimensions.test.ts',
  'tests/template-dimensions-api.test.ts',
  'tests/templates-api.test.ts',
  'tests/workflow-interview-lifecycle.test.ts',
];

// Module-scope objects constructed from the (now lazy) prisma handle.
const DEPENDENTS = {
  'tests/audit-cleanup.service.test.ts': {
    old: 'const service = new AuditCleanupService(prisma);',
    decl: 'let service: AuditCleanupService;',
    assign: '  service = new AuditCleanupService(prisma);',
  },
  'tests/interview-repository.test.ts': {
    old: 'const repo = new InterviewRepository(prisma);',
    decl: 'let repo: InterviewRepository;',
    assign: '  repo = new InterviewRepository(prisma);',
  },
  'tests/message-repository.test.ts': {
    old: 'const repo = new MessageRepository(prisma);',
    decl: 'let repo: MessageRepository;',
    assign: '  repo = new MessageRepository(prisma);',
  },
};

const LAZY = [
  { file: 'tests/analysis-api.test.ts', describe: /describe\('POST \/api\/analysis\/aggregate\/:planId with real DB data', \(\) => \{/ },
  { file: 'tests/admin-shell-csrf.test.ts', describe: /describe\('admin shell CSRF transport', \(\) => \{/ },
  { file: 'tests/admin-plan-route-csrf.test.ts', describe: /describe\('plan route session CSRF', \(\) => \{/ },
  { file: 'tests/admin-plan-csrf.test.ts', describe: /describe\('browser-driven plan mutation CSRF', \(\) => \{/ },
  { file: 'tests/admin-template-csrf.test.ts', describe: /describe\('admin template mutation CSRF', \(\) => \{/ },
];

const DROP_FACADE_IMPORT = new Set([
  'tests/admin-shell-csrf.test.ts',
  'tests/admin-plan-route-csrf.test.ts',
  'tests/admin-template-csrf.test.ts',
]);

const CONSTRUCTION = 'const prisma = new PrismaClient();';
const report = [];

function addBeforeAllToVitestImport(src) {
  return src.replace(/import \{ ([^}]+) \} from 'vitest';/, (m, names) => {
    const list = names.split(',').map((s) => s.trim());
    if (list.includes('beforeAll')) return m;
    const at = list.indexOf('describe');
    if (at === -1) list.push('beforeAll');
    else list.splice(at, 0, 'beforeAll');
    return `import { ${list.join(', ')} } from 'vitest';`;
  });
}

function insertHelperImport(src) {
  if (src.includes('create-test-prisma.js')) return src;
  const lines = src.split('\n');
  const lastImport = lines.reduce((acc, line, i) => (line.startsWith('import ') ? i : acc), -1);
  if (lastImport === -1) throw new Error('no import anchor');
  lines.splice(lastImport + 1, 0, HELPER_IMPORT);
  return lines.join('\n');
}

for (const file of EAGER) {
  let src = readFileSync(file, 'utf8');
  if (src.includes('getSharedTestPrisma')) {
    report.push(`${file}: SKIP (already converted)`);
    continue;
  }
  if (!src.includes(CONSTRUCTION)) throw new Error(`${file}: eager anchor not found`);
  const dep = DEPENDENTS[file];
  const beforeAllBody = ['  prisma = await getSharedTestPrisma();'];
  let block = 'let prisma: PrismaClient;\n\nbeforeAll(async () => {\n' + beforeAllBody.join('\n') + '\n});';
  if (dep) {
    if (!src.includes(dep.old)) throw new Error(`${file}: dependent anchor not found`);
    block = block.replace('\n});', `\n${dep.assign}\n});`);
    src = src.replace(dep.old, dep.decl);
  }
  src = src.replace(CONSTRUCTION, block);
  src = addBeforeAllToVitestImport(src);
  src = insertHelperImport(src);
  writeFileSync(file, src);
  report.push(`${file}: eager -> let + beforeAll${dep ? ' + dependent lazified' : ''}`);
}

for (const { file, describe } of LAZY) {
  let src = readFileSync(file, 'utf8');
  const indentRe = /^(\s*)const prisma = new PrismaClient\(\);$/m;
  const match = src.match(indentRe);
  if (!match) {
    report.push(`${file}: SKIP lazy anchor`);
    continue;
  }
  src = src.replace(indentRe, `$1const prisma = await getSharedTestPrisma();`);
  if (!describe.test(src)) throw new Error(`${file}: describe anchor not found`);
  src = src.replace(describe, (m) => m.replace("', () => {", "', async () => {"));
  if (DROP_FACADE_IMPORT.has(file)) {
    src = src.replace(/import \{ PrismaClient \} from '\.\.\/src\/utils\/prisma-client\.js';\n/, '');
  }
  src = insertHelperImport(src);
  writeFileSync(file, src);
  report.push(`${file}: lazy -> await getSharedTestPrisma() + async describe${DROP_FACADE_IMPORT.has(file) ? ' + facade import dropped' : ''}`);
}

console.log(report.join('\n'));
