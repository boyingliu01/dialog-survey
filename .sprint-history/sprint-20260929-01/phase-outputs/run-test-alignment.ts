import {
  parseSpecification,
  parseTestFiles,
  verifyAlignment,
  calculateScore,
  writeReport,
} from 'file:///C:/Users/think/AppData/Roaming/npm/node_modules/@boyingliu01/xp-gate/lib/test-alignment.ts';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

const root = 'D:/projects/dialog-survey/.worktrees/sprint-20260929-01';
const specPath = path.join(root, 'specification.yaml');
const spec = parseSpecification(specPath);

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') out.push(...collect(p));
    else if (e.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const allFiles = collect(path.join(root, 'tests'));
// Traceability domain of SPEC-PRISMA7-001: files annotated against this spec.
const domainFiles = allFiles.filter(f => /@test REQ-PRISMA7-/.test(fs.readFileSync(f, 'utf8')));

function evaluate(files: string[]) {
  const testMap = parseTestFiles(files);
  const report = verifyAlignment(spec, testMap);
  const score = calculateScore(report.issues, report.coverage, testMap);
  const byType: Record<string, number> = {};
  for (const i of report.issues) byType[i.type] = (byType[i.type] || 0) + 1;
  return { testMap, report, score, byType };
}

const repoWide = evaluate(allFiles);
const domain = evaluate(domainFiles);

console.log('--- repo-wide (all', allFiles.length, 'files) ---');
console.log('score:', repoWide.score, 'coverage:', JSON.stringify(repoWide.report.coverage));
console.log('issues:', JSON.stringify(repoWide.byType));

console.log('--- SPEC-PRISMA7-001 domain (', domainFiles.length, 'files) ---');
for (const f of domainFiles) console.log('   ', path.relative(root, f));
console.log('score:', domain.score, 'coverage:', JSON.stringify(domain.report.coverage));
console.log('issues:', JSON.stringify(domain.byType));
const uncoveredAc = domain.report.issues.filter(i => i.type === 'UNCOVERED_ACCEPTANCE_CRITERIA');
console.log('uncovered ACs:', uncoveredAc.map(i => i.acId).join(',') || 'none');

if (process.argv.includes('--write')) {
  const reqMapping: Record<string, string[]> = {};
  for (const r of spec.requirements) {
    reqMapping[r.id] = domain.testMap.tests
      .filter(t => t.requirementId === r.id)
      .map(t => `${path.relative(root, t.file).replace(/\\/g, '/')}#${t.name}`);
  }
  const acMapping: Record<string, string[]> = {};
  for (const r of spec.requirements) {
    for (const ac of r.acceptanceCriteria) {
      acMapping[ac] = domain.testMap.tests
        .filter(t => t.covers.includes(ac))
        .map(t => `${path.relative(root, t.file).replace(/\\/g, '/')}#${t.name}`);
    }
  }
  const antiPatterns = domainFiles
    .map(f => ({ f, hits: (fs.readFileSync(f, 'utf8').match(/\.(skip|todo)\(|\bxit\(/g) || []).length }))
    .filter(h => h.hits > 0);

  const out = {
    alignment_status: domain.score >= 80 ? 'PASS' : 'FAIL',
    phase: domain.score >= 80 ? 2 : 1,
    score: domain.score,
    head_commit: execSync('git rev-parse HEAD', { cwd: root }).toString().trim(),
    spec_hash: createHash('sha256').update(fs.readFileSync(specPath)).digest('hex'),
    timestamp: new Date().toISOString(),
    misaligned_tests: domain.report.issues.map(i => ({
      test_name: i.testId || 'unknown',
      spec_requirement: i.requirementId || 'unknown',
      gap: i.message,
    })),
    anti_pattern_detected: antiPatterns.length > 0,
    errors: [],
    scope: {
      specification: 'SPEC-PRISMA7-001',
      mode: 'requirement-scoped (docs/test-alignment/plan.md legacy mode: pre-existing tests belong to earlier specifications)',
      domain_files: domainFiles.map(f => path.relative(root, f).replace(/\\/g, '/')),
      repo_wide_baseline: {
        test_files: allFiles.length,
        annotated_tests: repoWide.testMap.totalTests,
        score: repoWide.score,
        issues_by_type: repoWide.byType,
        tests_with_intent: repoWide.report.coverage.testsWithIntent,
        note: `${repoWide.byType['MISSING_INTENT'] || 0} @intent gaps live in tests annotated against earlier specs (out of #149 scope; tracked as an emergent issue for Phase 6 CLOSE).`,
      },
    },
    disclosures: [
      'AC-PRISMA7-003-02: the mechanism clauses (single memoized template Blob per process, template boots with schema and zero rows, PG-free setup) are asserted by tests/prisma7-spec-invariants.test.ts; the numeric budgets (cold <= 5s incl. the prisma migrate diff subprocess, warm p95 <= 2s) are isolated-measurement evidence in docs/ac003-timing-and-memory-evidence.md and are NOT asserted by any test (wall-clock assertions proved unstable under suite file parallelism).',
      'AC-PRISMA7-005-02: container-side execution is covered by the docker-build baseline log plus CLI/health tests, not by a docker run in the unit suite (tier-(c) substitute evidence declared in the walkthrough).',
      'AC-PRISMA7-003-01 CI clause requires a green no-PostgreSQL run on the runner; inherently post-push and tracked as M1-CI backfill.',
    ],
    req_test_mapping: reqMapping,
    ac_assertion_mapping: acMapping,
  };
  writeReport(out as never, path.join(root, '.sprint-state/phase-outputs/test-alignment-report.json'));
  console.log('WROTE test-alignment-report.json:', out.alignment_status, out.score, out.head_commit);
}
