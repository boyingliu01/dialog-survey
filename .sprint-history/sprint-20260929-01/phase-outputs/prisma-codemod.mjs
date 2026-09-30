#!/usr/bin/env node
/**
 * Prisma facade import inventory + codemod (design DD-003 / DD-005 M-A1).
 *
 *   node .sprint-state/phase-outputs/prisma-codemod.mjs --report   # regenerate inventory
 *   node .sprint-state/phase-outputs/prisma-codemod.mjs --apply    # rewrite imports to facade path
 *
 * Excludes src/generated/** (generated code) and the facade itself. `vi.mock`
 * call sites are reported but NOT rewritten by --apply (handled manually with
 * the partial-mock pattern per design §3.4).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FACADE = 'src/utils/prisma-client.ts';
const SCAN_DIRS = ['src', 'tests', 'prisma', 'scripts'];
const MOCK_FILES = new Set([
  'tests/admin-templates-integration.test.ts',
  'tests/admin-templates-import.test.ts',
  'tests/health-api.test.ts',
  'tests/db.test.ts',
  'tests/security.test.ts',
  'tests/server-api.test.ts',
  'tests/server-lifecycle.test.ts',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = p.split(path.sep).join('/');
      if (entry.name === 'node_modules' || rel === 'src/generated') continue;
      walk(p, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(p.split(path.sep).join('/'));
    }
  }
  return out;
}

function facadeImportPath(file) {
  const rel = path.relative(path.dirname(file), FACADE).split(path.sep).join('/');
  const withDot = rel.startsWith('.') ? rel : `./${rel}`;
  return `${withDot.replace(/\.ts$/, '.js')}`;
}

function classify(file, content) {
  const lines = content.split('\n');
  const hits = { from: [], mock: [], dynamic: [], subpath: [] };
  lines.forEach((line, i) => {
    if (!line.includes('@prisma/client')) return;
    const ln = i + 1;
    if (/vi\.mock\(\s*'@prisma\/client'/.test(line)) hits.mock.push(ln);
    else if (/import\(\s*'@prisma\/client'\s*\)/.test(line)) hits.dynamic.push(ln);
    else if (/from\s+'@prisma\/client\/runtime/.test(line)) hits.subpath.push(ln);
    else if (/from\s+'@prisma\/client'/.test(line)) hits.from.push(ln);
  });
  return { file, facade: facadeImportPath(file), ...hits, mocked: MOCK_FILES.has(file) };
}

const files = SCAN_DIRS.flatMap((d) => walk(d)).filter((f) => f !== FACADE);
const entries = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('@prisma/client')) continue;
  entries.push(classify(file, content));
}
const targets = entries.filter(
  (e) => e.from.length || e.mock.length || e.dynamic.length || e.mocked
);

const report = {
  generatedAt: new Date().toISOString(),
  facade: FACADE,
  importFiles: targets.length,
  importFilesRaw: entries.length,
  viMockFiles: targets.filter((t) => t.mocked).map((t) => t.file),
  directoryFacadePaths: {},
  targets,
};
const dirs = {};
for (const t of targets) {
  const dir = path.dirname(t.file);
  dirs[dir] ??= t.facade;
  if (dirs[dir] !== t.facade) throw new Error(`inconsistent facade path for ${dir}`);
}
report.directoryFacadePaths = Object.fromEntries(Object.entries(dirs).sort());

if (process.argv.includes('--apply')) {
  let rewritten = 0;
  const skippedMocks = [];
  for (const t of targets) {
    if (t.mocked) {
      skippedMocks.push(t.file);
      continue;
    }
    let content = fs.readFileSync(t.file, 'utf8');
    const before = content;
    content = content.split(`from '@prisma/client'`).join(`from '${t.facade}'`);
    content = content.split(`import('@prisma/client')`).join(`import('${t.facade}')`);
    if (content !== before) {
      fs.writeFileSync(t.file, content);
      rewritten++;
    }
  }
  console.log(`rewritten=${rewritten}; mock-files-skipped=${skippedMocks.length} (hand-edit)`);
  for (const f of skippedMocks) console.log(`  hand-edit: ${f}`);
} else {
  fs.writeFileSync(
    '.sprint-state/phase-outputs/prisma-import-inventory.json',
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    `importFiles=${report.importFiles} rawMatches=${report.importFilesRaw} viMock=${report.viMockFiles.length}`
  );
  console.log('directory → facade path:');
  for (const [dir, p] of Object.entries(report.directoryFacadePaths)) console.log(`  ${dir} → ${p}`);
}
