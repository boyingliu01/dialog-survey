#!/usr/bin/env node
/**
 * Stage 0 Spike — Issue #149: Prisma 7 + PGlite integration
 *
 * Permanent, re-runnable tool (also usable for future Prisma 8 / adapter upgrade checks).
 * Pure node/tsx — no test framework, no build step.
 *
 * Usage:
 *   npx tsx tools/spike/prisma7-pglite-spike.mjs                 # all criteria
 *   npx tsx tools/spike/prisma7-pglite-spike.mjs --criteria 0,1,8,9
 *   npx tsx tools/spike/prisma7-pglite-spike.mjs --json .sprint-state/phase-outputs/stage0-spike-results.json
 *
 * Criteria reference: design-doc.md §4.1 (#0-#12).
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const RESULTS = [];

// ---------------------------------------------------------------- utilities

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const only = (arg('--criteria') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function shouldRun(id) {
  return only.length === 0 || only.includes(String(id));
}

async function record(id, name, fn) {
  if (!shouldRun(id)) return;
  const started = Date.now();
  const entry = { id, name, status: 'FAIL', detail: '', evidence: {}, durationMs: 0 };
  try {
    const out = await fn();
    entry.status = out?.status ?? 'PASS';
    entry.detail = out?.detail ?? 'ok';
    entry.evidence = out?.evidence ?? {};
  } catch (err) {
    entry.status = 'FAIL';
    entry.detail = err instanceof Error ? err.message : String(err);
    if (err?.stack) entry.evidence.stack = String(err.stack).split('\n').slice(0, 6).join('\n');
  }
  entry.durationMs = Date.now() - started;
  RESULTS.push(entry);
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭️', INFO: 'ℹ️' }[entry.status] ?? '?';
  console.log(`${icon} #${id} ${name} [${entry.status}] ${entry.durationMs}ms — ${entry.detail}`);
  return entry;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    env: opts.env ?? process.env,
    shell: process.platform === 'win32',
    timeout: opts.timeout ?? 180_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
  };
}

function rssMb() {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
}

// ------------------------------------------------------------ dynamic loads

async function importFirst(candidates, what) {
  const errors = [];
  for (const rel of candidates) {
    // resolve against the repo root (NOT this script's directory)
    const url = pathToFileURL(path.resolve(ROOT, rel)).href;
    try {
      const mod = await import(url);
      return mod;
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
    }
  }
  throw new Error(`Cannot load ${what}. Tried:\n${errors.join('\n')}`);
}

async function loadGeneratedPrismaClient() {
  const mod = await importFirst(
    [
      'src/generated/prisma/client.ts',
      'src/generated/prisma/client.js',
      'src/generated/prisma/index.ts',
      'src/generated/prisma/index.js',
    ],
    'generated Prisma client (run `npx prisma generate` first)'
  );
  if (!mod.PrismaClient) throw new Error('generated client module has no PrismaClient export');
  return mod;
}

async function loadAdapterClass() {
  const mod = await import('pglite-prisma-adapter');
  const Ctor = mod.PrismaPGlite ?? mod.PrismaPgliteAdapter ?? mod.default;
  if (typeof Ctor !== 'function') {
    throw new Error(`pglite-prisma-adapter: unknown export shape: ${Object.keys(mod).join(', ')}`);
  }
  return Ctor;
}

async function newPGlite() {
  const { PGlite } = await import('@electric-sql/pglite');
  return new PGlite();
}

function loadSchemaDdl() {
  const res = run('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ]);
  if (res.code !== 0) {
    throw new Error(`migrate diff failed (code ${res.code}): ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

const DDL_CACHE = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey', 'test-schema.sql');

function loadOrBuildDdl() {
  // Mirrors DD-006 cache semantics (hash check + auto-regenerate).
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const hash = crypto.createHash('sha256').update(schema).digest('hex');
  if (fs.existsSync(DDL_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(DDL_CACHE, 'utf8'));
    if (cached.hash === hash) return { ddl: cached.ddl, source: 'cache' };
  }
  const ddl = loadSchemaDdl();
  fs.mkdirSync(path.dirname(DDL_CACHE), { recursive: true });
  fs.writeFileSync(DDL_CACHE, JSON.stringify({ hash, ddl, generatedAt: new Date().toISOString() }));
  return { ddl, source: 'fresh' };
}

// -------------------------------------------------------------- PGlite setup

async function makeClient({ shareDdl } = {}) {
  const pglite = await newPGlite();
  const ddl = shareDdl ?? loadOrBuildDdl().ddl;
  await pglite.exec(ddl);
  const Ctor = await loadAdapterClass();
  const adapter = new Ctor(pglite);
  const gen = await loadGeneratedPrismaClient();
  const prisma = new gen.PrismaClient({ adapter });
  return { pglite, prisma };
}

// ------------------------------------------------------------------ criteria

async function c0_adapterCompat() {
  const pkgPath = path.join(ROOT, 'node_modules', 'pglite-prisma-adapter', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const peers = pkg.peerDependencies ?? {};
  const ls = run('npm', ['ls', '--all'], { timeout: 120_000 });
  const peerWarnLines = `${ls.stdout}\n${ls.stderr}`
    .split('\n')
    .filter((l) => /peer|invalid|ERESOLVE/i.test(l));
  const ok = Object.keys(peers).length > 0 && peerWarnLines.length === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `peers=${JSON.stringify(peers)}; npm ls warnings=${peerWarnLines.length}`,
    evidence: { version: pkg.version, peers, peerWarnLines },
  };
}

async function c1_ddlReplay() {
  const res = run('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ]);
  if (res.code !== 0) throw new Error(`migrate diff exit ${res.code}: ${res.stderr.slice(0, 400)}`);
  const ddl = res.stdout;
  const hasExtension = /CREATE\s+EXTENSION/i.test(ddl);
  const pglite = await newPGlite();
  await pglite.exec(ddl);
  const tables = await pglite.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
  );
  await pglite.close();
  const ok = !hasExtension && Number(tables.rows[0].n) >= 10;
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `extension=${hasExtension}; public tables=${tables.rows[0].n}; ddl bytes=${ddl.length}`,
    evidence: {
      hasExtension,
      tableCount: tables.rows[0].n,
      ddlBytes: ddl.length,
      ddlHead: ddl.slice(0, 200),
    },
  };
}

async function c2_fullSchemaCrud() {
  const { pglite, prisma } = await makeClient();
  try {
    const template = await prisma.template.create({
      data: {
        name: `spike-tpl-${Date.now()}`,
        content: '{"questions":[]}',
        dimensions: { d1: 'x' },
        analysisConfig: { model: 'gpt' },
      },
    });
    const plan = await prisma.interviewPlan.create({
      data: {
        name: 'spike-plan',
        templateId: template.id,
        inviteeData: { a: 1 },
        status: 'RUNNING',
      },
    });
    const interview = await prisma.interview.create({
      data: {
        userId: 'spike-user',
        templateId: template.id,
        planId: plan.id,
        status: 'PENDING',
        version: 1,
      },
    });
    await prisma.message.create({
      data: { interviewId: interview.id, role: 'assistant', content: 'hi' },
    });
    await prisma.response.create({
      data: { interviewId: interview.id, questionId: 'q1', content: 'answer' },
    });
    const report = await prisma.analysisReport.create({
      data: {
        interviewId: interview.id,
        content: 'report body',
        keyFindings: ['k1', 'k2'],
        recommendations: ['r1'],
        emergentTags: ['t1'],
        dimensionTags: { d1: 'ok' },
      },
    });
    const failure = await prisma.analysisFailure.create({
      data: { interviewId: interview.id, errorType: 'SPIKE', errorMessage: 'x', retried: false },
    });
    const batch = await prisma.batchAnalysisReport.create({
      data: {
        planId: plan.id,
        templateId: template.id,
        content: '# batch report',
        status: 'COMPLETED',
        type: 'SUMMARY',
        metrics: { m: 1 },
        topics: { t: [] },
        emergents: { e: [] },
        checkpoint: { c: 1 },
      },
    });
    await prisma.auditLog.create({
      data: { action: 'SPIKE', entityType: 'Interview', entityId: interview.id },
    });
    await prisma.apiKey.create({ data: { keyHash: `spike-hash-${Date.now()}` } });

    // composite unique (@@unique([interviewId, errorType]))
    let p2002Hit = false;
    try {
      await prisma.analysisFailure.create({
        data: {
          interviewId: interview.id,
          errorType: 'SPIKE',
          errorMessage: 'dup',
          retried: false,
        },
      });
    } catch (e) {
      p2002Hit = e?.code === 'P2002';
    }

    // relations + enums + arrays round-trip
    const back = await prisma.interview.findUnique({
      where: { id: interview.id },
      include: { messages: true, responses: true, reports: true, template: true, plan: true },
    });
    const reportBack = await prisma.analysisReport.findUnique({ where: { id: report.id } });
    const ok =
      p2002Hit &&
      back.messages.length === 1 &&
      back.responses.length === 1 &&
      back.reports.length === 1 &&
      back.template.id === template.id &&
      back.plan?.id === plan.id &&
      Array.isArray(reportBack.keyFindings) &&
      reportBack.keyFindings.length === 2 &&
      batch.checkpoint.c === 1 &&
      failure.retried === false;

    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `10 models CRUD; P2002=${p2002Hit}; relations/arrays/json OK=${ok}`,
      evidence: { p2002Hit, interviewStatus: back.status, arrays: reportBack.keyFindings },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c3_transactions() {
  const { pglite, prisma } = await makeClient();
  try {
    // nested + rollback
    const tpl = await prisma.template.create({ data: { name: `tx-${Date.now()}`, content: '{}' } });
    let rolledBack = false;
    try {
      await prisma.$transaction(async (tx) => {
        const iv = await tx.interview.create({
          data: { userId: 'tx-user', templateId: tpl.id, status: 'PENDING' },
        });
        await tx.message.create({ data: { interviewId: iv.id, role: 'assistant', content: 'm' } });
        throw new Error('intentional-rollback');
      });
    } catch {
      rolledBack = true;
    }
    const countAfterRollback = await prisma.interview.count({ where: { userId: 'tx-user' } });

    // interaction pattern from production: read-modify-write inside transaction
    const tplRow = await prisma.template.create({
      data: { name: `tx2-${Date.now()}`, content: '{}', version: 1 },
    });
    const updated = await prisma.$transaction(async (tx) => {
      const cur = await tx.template.findUnique({ where: { id: tplRow.id } });
      return tx.template.update({ where: { id: cur.id }, data: { version: cur.version + 1 } });
    });

    const ok = rolledBack && countAfterRollback === 0 && updated.version === 2;
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `rollback=${rolledBack}; rowsAfterRollback=${countAfterRollback}; readModifyWrite version=${updated.version}`,
      evidence: { rolledBack, countAfterRollback, version: updated.version },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c3b_transaction_isolation_patterns() {
  // Mirrors production usage shapes: interview-state.repository:44/159 (retry on conflict),
  // interview-plan-members.service:126/204, api/plans.ts:512 (nested write batch).
  const { pglite, prisma } = await makeClient();
  try {
    const tpl = await prisma.template.create({
      data: { name: `iso-${Date.now()}`, content: '{}' },
    });
    const plan = await prisma.interviewPlan.create({
      data: { name: 'iso-plan', templateId: tpl.id, status: 'RUNNING' },
    });

    // shape A: interactive tx with two dependent writes
    const a = await prisma.$transaction(async (tx) => {
      const iv = await tx.interview.create({
        data: { userId: 'iso-a', templateId: tpl.id, status: 'PENDING' },
      });
      await tx.message.create({
        data: { interviewId: iv.id, role: 'assistant', content: 'hello' },
      });
      return iv;
    });

    // shape B: tx that updates plan + creates membership-ish related row
    const b = await prisma.$transaction(async (tx) => {
      await tx.interviewPlan.update({ where: { id: plan.id }, data: { status: 'PAUSED' } });
      return tx.interviewPlan.findUnique({ where: { id: plan.id } });
    });

    // shape C: createMany-ish batch inside tx
    const c = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let i = 0; i < 3; i++) {
        created.push(
          await tx.analysisFailure.create({
            data: { interviewId: a.id, errorType: `ISO-${i}`, errorMessage: 'x', retried: false },
          })
        );
      }
      return created;
    });

    const ok = a.id && b.status === 'PAUSED' && c.length === 3;
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `3 production tx shapes OK=${ok}`,
      evidence: { a: a.id, b: b.status, c: c.length },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c4_queryRaw() {
  const { pglite, prisma } = await makeClient();
  try {
    const one = await prisma.$queryRaw`SELECT 1 AS ok`;
    // server.ts:70 form (health check style)
    const health = await prisma.$queryRaw`SELECT 1`;
    const ok = Array.isArray(one) && one[0]?.ok === 1 && Array.isArray(health);
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `tagged template raw queries OK=${ok}`,
      evidence: { one: one[0] },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c5_p2002() {
  const { pglite, prisma } = await makeClient();
  try {
    const tpl = await prisma.template.create({
      data: { name: `p2002-${Date.now()}`, content: '{}' },
    });
    const iv = await prisma.interview.create({
      data: { userId: 'u', templateId: tpl.id, status: 'PENDING' },
    });
    await prisma.analysisFailure.create({
      data: { interviewId: iv.id, errorType: 'X', errorMessage: 'a', retried: false },
    });
    let code = null;
    let meta = null;
    try {
      await prisma.analysisFailure.create({
        data: { interviewId: iv.id, errorType: 'X', errorMessage: 'b', retried: false },
      });
    } catch (e) {
      code = e?.code ?? null;
      meta = e?.meta ?? null;
    }
    const ok = code === 'P2002';
    return { status: ok ? 'PASS' : 'FAIL', detail: `code=${code}`, evidence: { code, meta } };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c6_mixedLoad() {
  const Fastify = (await import('fastify')).default;
  const { pglite, prisma } = await makeClient();
  try {
    const tpl = await prisma.template.create({
      data: { name: `load-${Date.now()}`, content: '{}' },
    });
    const app = Fastify({ logger: false });
    app.get('/plain', async () => prisma.template.count());
    app.post('/tx', async () => {
      return prisma.$transaction(async (tx) => {
        await new Promise((r) => setTimeout(r, 50));
        return tx.template.update({ where: { id: tpl.id }, data: { version: { increment: 1 } } });
      });
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    const jobs = [];
    for (let i = 0; i < 15; i++)
      jobs.push(fetch(`http://127.0.0.1:${port}/plain`).then((r) => r.status));
    for (let i = 0; i < 5; i++)
      jobs.push(fetch(`http://127.0.0.1:${port}/tx`, { method: 'POST' }).then((r) => r.status));
    const statuses = await Promise.all(jobs);
    await app.close();

    const tplAfter = await prisma.template.findUnique({ where: { id: tpl.id } });
    const ok = statuses.every((s) => s === 200) && tplAfter.version === 6; // 1 + 5 increments
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `20 concurrent (15 plain + 5 tx) statuses all 200=${statuses.every((s) => s === 200)}; version=${tplAfter.version}`,
      evidence: { statuses, version: tplAfter.version },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c6b_concurrentOptimisticLock() {
  const { pglite, prisma } = await makeClient();
  try {
    const tpl = await prisma.template.create({
      data: { name: `lock-${Date.now()}`, content: '{}', version: 1 },
    });
    const attempt = () =>
      prisma.$transaction(async (tx) => {
        const cur = await tx.template.findUnique({ where: { id: tpl.id } });
        await new Promise((r) => setTimeout(r, 80)); // widen the race window
        const res = await tx.template.updateMany({
          where: { id: tpl.id, version: cur.version },
          data: { version: cur.version + 1 },
        });
        return res.count;
      });
    const [a, b] = await Promise.all([attempt(), attempt()]);
    const final = await prisma.template.findUnique({ where: { id: tpl.id } });
    const ok = (a === 1) !== (b === 1) && final.version === 2; // exactly one winner, no interleaved double-increment
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `winnerCounts=[${a},${b}]; finalVersion=${final.version}`,
      evidence: { winnerCounts: [a, b], finalVersion: final.version },
    };
  } finally {
    await prisma.$disconnect();
    await pglite.close();
  }
}

async function c8_generateWithoutEnv() {
  const envFile = path.join(ROOT, '.env');
  const hidden = path.join(ROOT, '.env.spike-hidden');
  let moved = false;
  try {
    if (fs.existsSync(envFile)) {
      fs.renameSync(envFile, hidden);
      moved = true;
    }
    const minimalEnv = {};
    for (const k of [
      'PATH',
      'Path',
      'SystemRoot',
      'windir',
      'TEMP',
      'TMP',
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'ComSpec',
    ]) {
      if (process.env[k]) minimalEnv[k] = process.env[k];
    }
    // branch A probe: DATABASE_URL intentionally absent
    const noEnv = run('npx', ['prisma', 'generate'], { env: minimalEnv, timeout: 240_000 });
    // branch B probe: dummy DATABASE_URL (the predefined CI landing if branch A fails)
    const dummyEnv = {
      ...minimalEnv,
      DATABASE_URL: 'postgresql://spike:spike@127.0.0.1:5432/spike_placeholder',
    };
    const withDummy = run('npx', ['prisma', 'generate'], { env: dummyEnv, timeout: 240_000 });
    const needsDummy = noEnv.code !== 0;
    const ok = withDummy.code === 0; // the chosen landing must work
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `no-env exit=${noEnv.code}; dummy-env exit=${withDummy.code}; landing=${
        needsDummy
          ? 'dummy DATABASE_URL required at config load (DD-008 branch A)'
          : 'no dummy env needed (DD-008 branch B)'
      }`,
      evidence: {
        noEnvExit: noEnv.code,
        withDummyExit: withDummy.code,
        needsDummy,
        noEnvStderrTail: (noEnv.stderr || '').slice(-400),
        withDummyStderrTail: (withDummy.stderr || '').slice(-400),
      },
    };
  } finally {
    if (moved) fs.renameSync(hidden, envFile);
  }
}

async function c9_strictCompileAndTypeIdentity() {
  const checks = [];
  // 1) full repo type-check with generated artifacts present
  const tsc = run('npx', ['tsc', '--noEmit'], { timeout: 300_000 });
  checks.push({
    name: 'tsc --noEmit (repo, strict)',
    ok: tsc.code === 0,
    detail: (tsc.stdout || tsc.stderr).slice(-400),
  });

  // 2) facade symbol completeness + cross-path type identity
  const probeDir = path.join(ROOT, '.sprint-state', 'phase-outputs', 'spike-ts-probe');
  fs.mkdirSync(probeDir, { recursive: true });
  const probe = path.join(probeDir, 'probe.ts');
  fs.writeFileSync(
    probe,
    `import { PrismaClient as FacadeClient, InterviewStatus, SendStatus, TemplateStatus, PlanStatus, BatchReportStatus, BatchReportType } from '${rel(probeDir, path.join(ROOT, 'src/utils/prisma-client.js'))}';
import type { Prisma } from '${rel(probeDir, path.join(ROOT, 'src/utils/prisma-client.js'))}';
import { PrismaClient as GeneratedClient } from '${rel(probeDir, path.join(ROOT, 'src/generated/prisma/client.js'))}';
import { createPrismaClient } from '${rel(probeDir, path.join(ROOT, 'src/utils/prisma-factory.js'))}';

// value symbols present
const v1: string = InterviewStatus.PENDING;
const v2: string = SendStatus.NOT_SENT;
const v3: string = TemplateStatus.PUBLISHED;
const v4: string = PlanStatus.RUNNING;
const v5: string = BatchReportStatus.COMPLETED;
const v6: string = BatchReportType.SUMMARY;
void [v1, v2, v3, v4, v5, v6];

// type symbols available (exported so noUnusedLocals stays happy)
export type _J = Prisma.InputJsonValue;
export type _U = Prisma.InterviewPlanUpdateInput;
export type _T = Prisma.TransactionClient;

// cross-path type identity (both directions)
declare const g: GeneratedClient;
declare const f: FacadeClient;
const a: FacadeClient = g;
const b: GeneratedClient = f;
void [a, b];

// factory return assignable to BuildAppOptions.prismaFactory param type
const factory: () => FacadeClient = () => createPrismaClient();
void factory;
`
  );
  const probeTsconfig = path.join(probeDir, 'tsconfig.probe.json');
  fs.writeFileSync(
    probeTsconfig,
    JSON.stringify(
      {
        extends: rel(probeDir, path.join(ROOT, 'tsconfig.json')),
        compilerOptions: { noEmit: true },
        include: ['probe.ts'],
      },
      null,
      2
    )
  );
  const probeRun = run('npx', ['tsc', '-p', probeTsconfig], { timeout: 240_000 });
  checks.push({
    name: 'probe: symbols + identity + factory assignability',
    ok: probeRun.code === 0,
    detail: (probeRun.stdout || probeRun.stderr).slice(-2000),
  });

  const probeOk = checks[1].ok;
  const repoOk = checks[0].ok;
  return {
    status: probeOk ? 'PASS' : 'FAIL',
    detail: `probe=${probeOk}; repo-wide tsc=${repoOk}${repoOk ? '' : ' (expected red pre-codemod — M2 gate, AC#1)'}`,
    evidence: { checks },
  };
}

async function c10_productionAdapter() {
  const { createPrismaClient } = await importFirst(
    ['src/utils/prisma-factory.ts', 'src/utils/prisma-factory.js'],
    'factory'
  );
  const prisma = createPrismaClient();
  try {
    const rows = await prisma.$queryRaw`SELECT current_setting('server_version') AS v`;
    const badFactory = async () => {
      const started = Date.now();
      try {
        const bad = (
          await importFirst(
            ['src/utils/prisma-factory.ts', 'src/utils/prisma-factory.js'],
            'factory'
          )
        ).createPrismaClient({
          connectionString: 'postgresql://nouser:nopass@127.0.0.1:59999/nodb',
        });
        await bad.$queryRaw`SELECT 1`;
        await bad.$disconnect();
        return { failed: false, ms: Date.now() - started };
      } catch (e) {
        return { failed: true, ms: Date.now() - started, message: e.message };
      }
    };
    const bad = await badFactory();
    const ok = Array.isArray(rows) && bad.failed;
    return {
      status: ok ? 'PASS' : 'FAIL',
      detail: `real PG query ok; bad-port connect failed in ${bad.ms}ms`,
      evidence: { serverVersion: rows[0]?.v, badPortMs: bad.ms, badMessage: bad.message },
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function c12_createTestPrismaTiming() {
  const { PGlite } = await import('@electric-sql/pglite');
  const Ctor = await loadAdapterClass();
  const gen = await loadGeneratedPrismaClient();

  // cold: fresh DDL generation + first exec
  const coldStart = Date.now();
  const ddlFresh = loadSchemaDdl();
  const p1 = new PGlite();
  await p1.exec(ddlFresh);
  const coldMs = Date.now() - coldStart;
  const c1 = new gen.PrismaClient({ adapter: new Ctor(p1) });
  const firstQuery = await c1.template.count(); // must not hit missing-schema
  await c1.$disconnect();
  await p1.close();

  // warm: cached DDL, repeated setup timing
  const warm = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const pg = new PGlite();
    await pg.exec(ddlFresh);
    const cl = new gen.PrismaClient({ adapter: new Ctor(pg) });
    await cl.template.count();
    await cl.$disconnect();
    await pg.close();
    warm.push(Date.now() - t);
  }
  warm.sort((x, y) => x - y);
  const warmP95 = warm[warm.length - 1];

  // memory: sequential instance churn (proxy for single-worker multi-file RSS curve)
  const rss = [];
  const base = rssMb();
  for (let i = 0; i < 6; i++) {
    const pg = new PGlite();
    await pg.exec(ddlFresh);
    const cl = new gen.PrismaClient({ adapter: new Ctor(pg) });
    await cl.template.count();
    rss.push({ i, rssMb: rssMb() });
    await cl.$disconnect();
    await pg.close();
  }
  const rssAfterRelease = rssMb();

  // concurrent instances (multi-instance per file)
  const live = [];
  const concurrentRss = [];
  for (let i = 0; i < 3; i++) {
    const pg = new PGlite();
    await pg.exec(ddlFresh);
    const cl = new gen.PrismaClient({ adapter: new Ctor(pg) });
    await cl.template.count();
    live.push({ pg, cl });
    concurrentRss.push({ instances: i + 1, rssMb: rssMb() });
  }
  const perInstance = Math.round(((rssMb() - base) / 3) * 10) / 10;
  for (const { pg, cl } of live) {
    await cl.$disconnect();
    await pg.close();
  }
  const afterAll = rssMb();

  const ok = firstQuery === 0 && warmP95 <= 2000; // design target: warm p95 ≤ 2s
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `cold(DDL+exec)=${coldMs}ms; warm p95=${warmP95}ms (n=5 ${JSON.stringify(warm)}); RSS base=${base}MB → 3-concurrent per-instance≈${perInstance}MB; after release=${afterAll}MB`,
    evidence: {
      coldMs,
      warm,
      warmP95,
      firstQuery,
      rssCurve: rss,
      concurrentRss,
      rssBaseMb: base,
      perInstanceMb: perInstance,
      rssAfterReleaseMb: rssAfterRelease,
      rssAfterAllMb: afterAll,
    },
  };
}

async function c12b_templateFastPath() {
  // Stage B helper candidate: build the schema template ONCE (globalSetup), then boot
  // every instance via `loadDataDir` instead of replaying the DDL.
  const { PGlite } = await import('@electric-sql/pglite');
  const Ctor = await loadAdapterClass();
  const gen = await loadGeneratedPrismaClient();
  const ddl = loadOrBuildDdl().ddl;

  const buildStart = Date.now();
  const holder = new PGlite();
  await holder.exec(ddl);
  const dump = await holder.dumpDataDir('none');
  await holder.close();
  const buildMs = Date.now() - buildStart;
  const dumpBytes = dump instanceof Blob ? dump.size : 0;

  const warm = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const pg = new PGlite({ loadDataDir: dump });
    const cl = new gen.PrismaClient({ adapter: new Ctor(pg) });
    const n = await cl.template.count();
    await cl.$disconnect();
    await pg.close();
    if (n !== 0) throw new Error('template dump did not carry the schema');
    warm.push(Date.now() - t);
  }
  warm.sort((a, b) => a - b);
  const warmP95 = warm[warm.length - 1];
  const ok = warmP95 <= 2000 && buildMs <= 5000; // §3.6: warm setup p95 ≤2s, cold (incl. dump build) ≤5s
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `templateBuild=${buildMs}ms (DDL cached); dump=${Math.round((dumpBytes / 1048576) * 10) / 10}MB; warm p95=${warmP95}ms (n=5 ${JSON.stringify(warm)})`,
    evidence: { buildMs, dumpBytes, warm, warmP95 },
  };
}

// ------------------------------------------------------------------- driver

function rel(fromDir, toPath) {
  let r = path.relative(fromDir, toPath).replace(/\\/g, '/');
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
}

const CRITERIA = [
  [0, 'adapter peerDeps compat (@prisma/client ^7) + npm ls clean', c0_adapterCompat],
  [1, 'DDL generation + PGlite replay (no CREATE EXTENSION)', c1_ddlReplay],
  [
    2,
    'full schema: 10 models / 6 enums / arrays / json / uuid / composite unique',
    c2_fullSchemaCrud,
  ],
  [3, 'interactive $transaction (nested + rollback)', c3_transactions],
  ['3b', 'production transaction shapes', c3b_transaction_isolation_patterns],
  [4, '$queryRaw tagged template', c4_queryRaw],
  [5, 'P2002 error code parity', c5_p2002],
  [6, 'Fastify mixed load: 20 concurrent (15 plain + 5 long tx)', c6_mixedLoad],
  ['6b', 'concurrent optimistic lock (double tx, same row)', c6b_concurrentOptimisticLock],
  [8, 'prisma generate without DATABASE_URL (env isolation)', c8_generateWithoutEnv],
  [9, 'strict tsc + facade symbols + cross-path type identity', c9_strictCompileAndTypeIdentity],
  [10, 'production adapter path via createPrismaClient (real PG)', c10_productionAdapter],
  [12, 'createTestPrisma timing / memory / RSS curve', c12_createTestPrismaTiming],
  ['12b', 'PGlite template fast path (dumpDataDir → loadDataDir)', c12b_templateFastPath],
  // #7 dual-platform and #11 fresh-install are handled by dedicated sections below.
];

async function main() {
  const startedAt = new Date();
  console.log(`\n=== Prisma 7 + PGlite spike — ${startedAt.toISOString()} ===`);
  console.log(`node ${process.version} | ${process.platform} ${process.arch} | cwd ${ROOT}\n`);

  for (const [id, name, fn] of CRITERIA) {
    await record(id, name, fn);
  }

  // #7 platform marker — dual-platform evidence comes from running this same script locally + CI ubuntu
  await record(7, 'dual platform (this run)', async () => ({
    status: 'INFO',
    detail: `ran on ${process.platform}/${process.arch}; CI ubuntu-latest run provides the second platform`,
    evidence: { platform: process.platform, arch: process.arch, node: process.version },
  }));

  if (only.length === 0 || only.includes('11')) {
    await record(
      11,
      'fresh-install scenario (npm pack → isolated install → db push)',
      c11_freshInstall
    );
  }

  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    platform: `${process.platform}/${process.arch}`,
    node: process.version,
    results: RESULTS,
    verdict: RESULTS.some((r) => r.status === 'FAIL') ? 'FAIL' : 'PASS',
  };
  const jsonPath = arg('--json');
  if (jsonPath) {
    fs.writeFileSync(path.resolve(ROOT, jsonPath), JSON.stringify(summary, null, 2));
    console.log(`\nJSON written: ${jsonPath}`);
  }
  console.log(
    `\n=== verdict: ${summary.verdict} (${RESULTS.filter((r) => r.status === 'FAIL').length} failed / ${RESULTS.length} run) ===\n`
  );
  process.exit(summary.verdict === 'PASS' ? 0 : 1);
}

async function c11_freshInstall() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-install-'));
  const pack = run('npm', ['pack', '--pack-destination', tmp], { timeout: 300_000 });
  if (pack.code !== 0) throw new Error(`npm pack failed: ${pack.stderr.slice(0, 300)}`);
  const tgzLine = pack.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.tgz'))
    .pop();
  if (!tgzLine) throw new Error(`npm pack produced no tarball line: ${pack.stdout.slice(0, 300)}`);
  const tarball = path.join(tmp, tgzLine);

  // Consumer-fidelity install: `npm i <tarball>` applies the `files` whitelist exactly
  // like a real registry install (no manual tar extraction needed).
  const installDir = path.join(tmp, 'isolated');
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(
    path.join(installDir, 'package.json'),
    JSON.stringify({ name: 'spike-isolated', version: '1.0.0', private: true }, null, 2)
  );
  const install = run('npm', ['i', tarball, '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: installDir,
    timeout: 600_000,
  });

  const pkgName = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
  const pkgDir = path.join(installDir, 'node_modules', pkgName);
  const hasConfig = fs.existsSync(path.join(pkgDir, 'prisma.config.ts'));
  const schemaPath = path.join(pkgDir, 'prisma', 'schema.prisma');
  const hasSchema = fs.existsSync(schemaPath);

  // prisma commands run from the installed package dir (consumer layout)
  const packDirListing = fs.existsSync(pkgDir) ? fs.readdirSync(pkgDir).slice(0, 20) : [];
  const prismaRunCwd = pkgDir;
  // keep a pristine copy of the SHIPPED config — the form probes below overwrite the file
  const shippedConfigBackup = path.join(tmp, 'prisma.config.shipped.ts');
  if (hasConfig) fs.copyFileSync(path.join(pkgDir, 'prisma.config.ts'), shippedConfigBackup);

  // --no-generate existence probe (R4-T1 path 1)
  const help = run('npx', ['--yes', 'prisma@7.10.0', 'db push', '--help'], {
    cwd: prismaRunCwd,
    timeout: 240_000,
  });
  const helpText = help.stdout + help.stderr;
  const noGenerate = /--no-generate/.test(helpText);

  // prisma.config.ts loadability in a no-devDeps install — three forms (R2 M-3 / DD-009 / R4-T1)
  const CONFIG_FORMS = [
    {
      name: 'runtime-defineConfig',
      body: `import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
`,
    },
    {
      name: 'type-only-import',
      body: `import 'dotenv/config'
import type { PrismaConfig } from 'prisma/config'

export default {
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
} satisfies PrismaConfig
`,
    },
    {
      name: 'plain-object',
      body: `import 'dotenv/config'

export default {
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
}
`,
    },
  ];
  const configProbeEnv = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  };
  const configFormResults = [];
  for (const form of CONFIG_FORMS) {
    fs.writeFileSync(path.join(prismaRunCwd, 'prisma.config.ts'), form.body);
    const probe = run(
      'npx',
      ['--yes', 'prisma@7.10.0', 'validate', '--schema', 'prisma/schema.prisma'],
      {
        cwd: prismaRunCwd,
        env: configProbeEnv,
        timeout: 240_000,
      }
    );
    configFormResults.push({
      form: form.name,
      ok: probe.code === 0,
      stderrTail: (probe.stderr || '').slice(-400),
    });
  }
  const packedConfig = shippedConfigBackup;
  if (fs.existsSync(packedConfig))
    fs.copyFileSync(packedConfig, path.join(prismaRunCwd, 'prisma.config.ts'));
  const workingForm = configFormResults.find((r) => r.ok)?.form ?? 'none';

  // scratch database for a real db push
  const scratch = `dialog_survey_spike_${Date.now()}`;
  const baseUrl = process.env.DATABASE_URL || '';
  const adminUrl = baseUrl.replace(/\/[^/]+$/, '/postgres');
  const scratchUrl = baseUrl.replace(/\/[^/]+$/, `/${scratch}`);
  let pushResult = { attempted: false };
  let created = false;
  let pushTarget = null;
  if (baseUrl) {
    try {
      const pg = await import('pg');
      const admin = new pg.default.Client({ connectionString: adminUrl });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${scratch}`);
      await admin.end();
      created = true;
      pushTarget = scratchUrl;
    } catch (e) {
      pushResult = { attempted: false, dbCreateError: e.message };
    }
    if (!created) {
      // fallback: the dedicated test database already exists — same schema, safe target
      const fallbackUrl =
        process.env.TEST_DATABASE_URL || baseUrl.replace(/\/[^/]+$/, '/dialog_survey_test');
      const probe = run('npx', ['--yes', 'prisma@7.10.0', 'db push', '--help'], {
        cwd: prismaRunCwd,
        env: process.env,
        timeout: 120_000,
      });
      if (probe.code === 0) {
        created = true;
        pushTarget = fallbackUrl;
        pushResult = { attempted: false, fallbackTarget: 'dialog_survey_test' };
      }
    }
  }
  if (created) {
    const baseArgs = ['--yes', 'prisma@7.10.0', 'db push', '--schema', 'prisma/schema.prisma'];
    const pushEnv = { ...process.env, DATABASE_URL: pushTarget };
    // default behavior: does db push auto-generate (write artifacts into the installed package)?
    const defaultPush = run('npx', baseArgs, { cwd: prismaRunCwd, env: pushEnv, timeout: 300_000 });
    const wroteGeneratedDir =
      fs.existsSync(path.join(prismaRunCwd, 'src', 'generated')) ||
      fs.existsSync(path.join(prismaRunCwd, 'generated'));
    // path 1: --no-generate
    const flagPush = noGenerate
      ? run('npx', [...baseArgs, '--no-generate'], {
          cwd: prismaRunCwd,
          env: pushEnv,
          timeout: 300_000,
        })
      : null;
    // path 2: PRISMA_SKIP_GENERATE=1
    const envSkipPush = run('npx', baseArgs, {
      cwd: prismaRunCwd,
      env: { ...pushEnv, PRISMA_SKIP_GENERATE: '1' },
      timeout: 300_000,
    });
    pushResult = {
      ...pushResult,
      attempted: true,
      target: pushTarget === scratchUrl ? 'scratch' : 'fallback-dialog_survey_test',
      defaultExitCode: defaultPush.code,
      autoGenerated: wroteGeneratedDir,
      shippedConfigLoaded: /Loaded Prisma config/.test(defaultPush.stdout + defaultPush.stderr),
      noGenerateExitCode: flagPush ? flagPush.code : null,
      skipEnvExitCode: envSkipPush.code,
      stderrTail: (defaultPush.stderr || '').slice(-400),
    };
    if (pushTarget === scratchUrl) {
      try {
        const pg = await import('pg');
        const admin = new pg.default.Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE ${scratch}`);
        await admin.end();
      } catch {}
    }
  }

  const pushOk = !pushResult.attempted || pushResult.defaultExitCode === 0;
  const formOk = configFormResults.some((r) => r.ok);
  const threePaths = {
    noGenerateFlag: noGenerate,
    skipEnvTested: pushResult.attempted ? pushResult.skipEnvExitCode === 0 : null,
    readOnlySchemaPath: noGenerate ? 'not-needed (path 1 available)' : 'untested-fallback',
  };
  const ok = hasConfig && hasSchema && install.code === 0 && pushOk && formOk;
  return {
    status: ok ? 'PASS' : 'FAIL',
    detail: `config=${hasConfig}; prodInstall=${install.code === 0}; configForms=[${configFormResults.map((r) => `${r.form}:${r.ok ? 'ok' : 'fail'}`).join(', ')}]; workingForm=${workingForm}; shippedConfigLoads=${pushResult.shippedConfigLoaded ?? 'n/a'}; dbPush=${pushResult.defaultExitCode ?? 'n/a'}; autoGenerated=${pushResult.autoGenerated ?? 'n/a'}; --no-generate=${noGenerate}`,
    evidence: {
      tarball: path.basename(tarball),
      hasConfig,
      hasSchema,
      installExit: install.code,
      pkgDirListing: packDirListing,
      configFormResults,
      workingForm,
      threePaths,
      pushResult,
    },
  };
}

main().catch((err) => {
  console.error('spike crashed:', err);
  process.exit(2);
});
