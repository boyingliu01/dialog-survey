import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getTemplateDataDir, getTemplateHealth } from './helpers/pglite-template.js';
import { TestDatabase } from './helpers/test-db.js';

const read = (p: string): string => fs.readFileSync(p, 'utf-8');

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listTestFiles(full));
    else if (/\.(test|spec)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Steps of one job, each step the text of ONLY its `run:` lines — names, comments and nested with:/env: cannot match. */
function jobRunSteps(yml: string, job: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) throw new Error(`job not found: ${job}`);
  const steps: string[] = [];
  let current: string[] | undefined;
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}\S/.test(line)) break;
    if (/^ {6}-\s/.test(line)) {
      if (current) steps.push(current.join('\n'));
      current = [];
      continue;
    }
    const run = current !== undefined ? line.match(/^ {8}run:\s*(.*)$/) : null;
    if (current && run && run[1] !== '|' && run[1] !== '>') current.push(run[1]);
  }
  if (current) steps.push(current.join('\n'));
  return steps;
}

/**
 * @test REQ-PRISMA7-001
 * @intent AC-PRISMA7-001-01 静态契约：prisma 全家桶精确 pin 7.10.0、generator 为
 * prisma-client 且输出到 src/generated/prisma、生成物 .ts 已落地、tsconfig 不排除生成目录。
 * @covers AC-PRISMA7-001-01
 */
describe('prisma 7 generate contract (AC-001-01)', () => {
  it('pins every prisma-family dependency to the exact spike-approved version', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const dep = (name: string): string | undefined =>
      pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    expect(dep('prisma')).toBe('7.10.0');
    expect(dep('@prisma/client')).toBe('7.10.0');
    expect(dep('@prisma/adapter-pg')).toBe('7.10.0');
    expect(dep('@electric-sql/pglite')).toBe('0.5.8');
    expect(dep('pglite-prisma-adapter')).toBe('0.7.2');
    expect(pkg.engines?.['node']).toBe('>=20.19.0');
    expect(pkg.scripts?.['prisma:generate']).toBe('prisma generate');
  });

  it('configures the prisma-client generator against src/generated/prisma (DD-002)', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toMatch(/provider\s*=\s*"prisma-client"/);
    expect(schema).toMatch(/output\s*=\s*"\.\.\/src\/generated\/prisma"/);
  });

  it('ships .ts generated artifacts that are typechecked, not excluded', () => {
    expect(fs.existsSync('src/generated/prisma/client.ts')).toBe(true);
    expect(fs.existsSync('src/generated/prisma/enums.ts')).toBe(true);
    expect(read('src/generated/prisma/client.ts').length).toBeGreaterThan(0);
    const tsconfig = JSON.parse(read('tsconfig.json')) as {
      include?: string[];
      exclude?: string[];
    };
    for (const pattern of tsconfig.exclude ?? []) {
      expect(pattern).not.toMatch(/generated/);
    }
    expect(tsconfig.include ?? []).toEqual(expect.arrayContaining(['src/**/*', 'tests/**/*']));
  });
});

/**
 * @test REQ-PRISMA7-002
 * @intent AC-PRISMA7-002-02 清单勾销的可执行等价形式：测试域内零 PrismaClient 构造点，
 * 构造只发生在 helpers；对生成目录的引用只允许 import type（门面是唯一符号入口）。
 * @covers AC-PRISMA7-002-02
 */
describe('test-domain construction triage (AC-002-02)', () => {
  it('never constructs PrismaClient inside a test file', () => {
    const offenders: string[] = [];
    for (const file of listTestFiles('tests')) {
      const code = read(file)
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      if (/new PrismaClient\(/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('imports the generated client only as a type, and constructs helpers from the facade', () => {
    for (const file of listTestFiles('tests')) {
      for (const line of read(file).split('\n')) {
        if (/generated\/prisma/.test(line) && /^import/.test(line)) {
          expect(line.startsWith('import type')).toBe(true);
        }
      }
    }
    for (const helper of ['tests/helpers/create-test-prisma.ts', 'tests/helpers/test-db.ts']) {
      expect(read(helper)).toMatch(/from '\.\.\/\.\.\/src\/utils\/prisma-client\.js'/);
    }
  });
});

/**
 * @test REQ-PRISMA7-003
 * @intent AC-PRISMA7-003-01 无 PG 依赖：删除 DATABASE_URL 后 TestDatabase 仍可建库并查询。
 * AC-PRISMA7-003-02 断言 warm 快路径的机制（模板 Blob 进程内记忆化 + 模板自带 schema）；
 * 其数值预算（冷 ≤5s 含 migrate diff、warm p95 ≤2s）为隔离测量证据，见
 * docs/ac003-timing-and-memory-evidence.md — 壁钟断言在全量并行下不稳定。
 * @covers AC-PRISMA7-003-01, AC-PRISMA7-003-02
 */
describe('tests run without PostgreSQL (AC-003)', () => {
  it('sets up and queries with DATABASE_URL removed from the environment', async () => {
    const saved = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    const db = new TestDatabase();
    try {
      await db.setup();
      const rows = await db.getPrisma().$queryRaw`SELECT 1 AS one`;
      expect(rows).toHaveLength(1);
    } finally {
      await db.teardown();
      if (saved === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = saved;
    }
  });

  it('serves every boot from one memoized template carrying the schema', async () => {
    const first = await getTemplateDataDir();
    expect(await getTemplateDataDir()).toBe(first);
    expect(getTemplateHealth(), 'no silent fallback to DDL replay').toEqual({
      disabled: false,
      failures: 0,
    });
    const db = new TestDatabase();
    await db.setup();
    try {
      expect(await db.getPrisma().template.count()).toBe(0);
    } finally {
      await db.teardown();
    }
  });
});

/**
 * @test REQ-PRISMA7-003
 * @intent AC-PRISMA7-003-02 降级语义：模板加载失败时，坏 Blob 同时从磁盘缓存和进程记忆化中
 * 作废（否则后续调用方会永远拿到死模板）；失败实例走 DDL replay 仍可启动并自带 schema；
 * latch/失败次数经 getTemplateHealth() 可观测，恢复后的新进程重新吃到健康模板。
 * @covers AC-PRISMA7-003-02
 */
describe('template fast-path failure semantics (AC-003-02)', () => {
  it(
    'discards a corrupt template from disk and memo, boots via DDL replay, rebuilds after',
    { timeout: 180_000 },
    async () => {
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-template-contract-'));
      const savedCacheDir = process.env['PGLITE_TEST_CACHE_DIR'];
      process.env['PGLITE_TEST_CACHE_DIR'] = cacheDir;
      const importHelper = async () => {
        vi.resetModules();
        return import('./helpers/pglite-template.js');
      };
      const templatePathIn = (): string => {
        const names = fs
          .readdirSync(cacheDir)
          .filter((name) => name.startsWith('pglite-template-') && name.endsWith('.tar'));
        expect(names, 'exactly one template cache file').toHaveLength(1);
        return path.join(cacheDir, names[0]);
      };
      try {
        const healthy = await importHelper();
        await (await healthy.createTestPglite()).close();
        expect(healthy.getTemplateHealth()).toEqual({ disabled: false, failures: 0 });
        const templatePath = templatePathIn();

        fs.writeFileSync(templatePath, 'corrupted-cache-entry');

        const degraded = await importHelper();
        const corrupt = await degraded.getTemplateDataDir();
        const replay = await degraded.createTestPglite();
        try {
          expect((await replay.exec('SELECT count(*) FROM "Template"')).length).toBe(1);
        } finally {
          await replay.close();
        }
        expect(degraded.getTemplateHealth()).toEqual({ disabled: true, failures: 1 });
        expect(await degraded.getTemplateDataDir()).not.toBe(corrupt);
        expect(fs.statSync(templatePathIn()).size).toBeGreaterThan(1024);

        const recovered = await importHelper();
        await (await recovered.createTestPglite()).close();
        expect(recovered.getTemplateHealth()).toEqual({ disabled: false, failures: 0 });
      } finally {
        if (savedCacheDir === undefined) delete process.env['PGLITE_TEST_CACHE_DIR'];
        else process.env['PGLITE_TEST_CACHE_DIR'] = savedCacheDir;
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    }
  );
});

/** Body of one top-level job (2-space indent key), including its nested blocks. */
function jobBlock(yml: string, job: string): string {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * @test REQ-PRISMA7-004
 * @intent AC-PRISMA7-004-01 workflows 不再声明 postgres service / db push，node 版本取自
 * .nvmrc；AC-PRISMA7-004-02 六个消费 job 与 publish job 的 prisma generate 先于 tsc/vitest/build。
 * 例外：backup-drill (#179) 对真实 PostgreSQL 演练 pg_dump/pg_restore 往返，属于
 * Prisma-free 的运维 job，是唯一允许声明 postgres service 的 job，且不得对其跑任何
 * prisma 命令。
 * @covers AC-PRISMA7-004-01, AC-PRISMA7-004-02
 */
describe('CI workflows are PG-free and generate-first (AC-004)', () => {
  const pr = read('.github/workflows/pr.yml');
  const publish = read('.github/workflows/publish.yml');

  it('declares no postgres service outside the prisma-free backup drill', () => {
    const drill = jobBlock(pr, 'backup-drill');
    expect(drill).not.toBe('');
    expect(drill).toMatch(/^ {4}services:$/m);
    expect(drill).toMatch(/image:\s*postgres:16-alpine/);
    // Case-insensitive and unrestricted: also rejects alias forms such as
    // `npx @prisma/cli`, `node_modules/.bin/prisma`, `pnpm prisma` or a bare
    // `node node_modules/prisma/build/index.js` invocation.
    expect(drill).not.toMatch(/prisma/i);

    const prismaSide = pr.replace(drill, '');
    for (const yml of [prismaSide, publish]) {
      expect(yml).not.toMatch(/^\s*services:/m);
      expect(yml).not.toMatch(/image:\s*postgres/i);
      expect(yml).not.toMatch(/prisma db push/);
      expect(yml).toMatch(/node-version-file:\s*'.nvmrc'/);
    }
  });

  it('runs prisma generate before any consuming command in each job', () => {
    const generatingJobs: Array<[string, string, string[]]> = [
      ['static-analysis', pr, ['npx tsc --noEmit']],
      ['unit-tests', pr, ['npx vitest run']],
      ['integration-tests', pr, ['npx vitest run']],
      ['coverage', pr, ['npx vitest run --coverage']],
      ['e2e-tests', pr, ['npx vitest run']],
      ['smoke', pr, ['npm run smoke']],
      ['publish', publish, ['npm run test:coverage', 'npm run build']],
    ];
    for (const [job, yml, consumers] of generatingJobs) {
      const steps = jobRunSteps(yml, job);
      const generateAt = steps.findIndex((step) => step.includes('npx prisma generate'));
      expect(generateAt, `${job}: generate step missing`).toBeGreaterThan(-1);
      for (const consumer of consumers) {
        const consumerAt = steps.findIndex((step) => step.includes(consumer));
        expect(consumerAt, `${job}: ${consumer} not found in a run: step`).toBeGreaterThan(-1);
        expect(consumerAt, `${job}: generate must precede ${consumer}`).toBeGreaterThan(generateAt);
      }
    }
  });
});

/**
 * @test REQ-PRISMA7-005
 * @intent AC-PRISMA7-005-01 发布包含 prisma.config.ts 且 CLI 复制/校验它；
 * AC-PRISMA7-005-02 生产构建产物路径（tsc→dist）与容器健康检查在无源码树下可用。
 * @covers AC-PRISMA7-005-01, AC-PRISMA7-005-02
 */
describe('release chain carries prisma config (AC-005)', () => {
  it('ships prisma.config.ts in the package and verifies it after install', () => {
    const pkg = JSON.parse(read('package.json')) as { files?: string[] };
    expect(pkg.files).toContain('prisma.config.ts');
    expect(fs.existsSync('prisma.config.ts')).toBe(true);
    const cli = read('scripts/cli.mjs');
    const copyList = cli.match(/const filesToCopy = \[[\s\S]*?\];/)?.[0] ?? '';
    const verifyList = cli.match(/const requiredFiles = \[[\s\S]*?\];/)?.[0] ?? '';
    expect(copyList, 'CLI must copy prisma.config.ts into the install tree').toContain(
      "'prisma.config.ts'"
    );
    expect(verifyList, 'CLI must verify prisma.config.ts after install').toContain(
      "'prisma.config.ts'"
    );
    expect(cli).toMatch(/npx --yes prisma@7\.10\.0 migrate deploy/);
    expect(cli).toContain('PRISMA_SKIP_GENERATE');
  });

  it('builds to dist and carries the runtime tree the container needs', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['build']).toBe('tsc');
    const docker = read('Dockerfile');
    expect(docker).toMatch(/COPY --from=builder \/app\/dist \.\/dist/);
    expect(docker).toMatch(/COPY --from=builder \/app\/prisma\.config\.ts/);
    expect(docker).toMatch(/HEALTHCHECK[\s\S]*node -e/);
    expect(docker).not.toMatch(/HEALTHCHECK[\s\S]*curl/);
  });
});

/**
 * @test REQ-PRISMA7-006
 * @intent AC-PRISMA7-006-01 工具链三处排除生成物且 architecture.yaml 声明门面/工厂；
 * AC-PRISMA7-006-02 spike 判据 #0-#12 齐备且项目文档（AGENTS/README/DEPLOY/setup-guide）同步更新。
 * @covers AC-PRISMA7-006-01, AC-PRISMA7-006-02
 */
describe('governance and documentation (AC-006)', () => {
  it('excludes generated artifacts from biome, coverage and git', () => {
    const biome = JSON.parse(read('biome.json')) as {
      files: { ignore: string[] };
      linter: { ignore: string[] };
      formatter: { ignore: string[] };
    };
    expect(biome.files.ignore).toContain('src/generated/');
    expect(biome.linter.ignore).toContain('src/generated/');
    expect(biome.formatter.ignore).toContain('src/generated/');
    expect(read('vitest.config.ts')).toMatch(/'src\/generated\/\*\*'/);
    expect(read('.gitignore')).toMatch(/^src\/generated\/$/m);
  });

  it('declares the facade and factory ownership in architecture.yaml', () => {
    const arch = read('architecture.yaml');
    expect(arch).toContain('prisma-client.ts');
    expect(arch).toContain('prisma-factory.ts');
    expect(arch).toContain('src/generated');
  });

  it('wires every spike criterion #0-#12 to an executable entry (not a comment mention)', () => {
    const spike = read('tools/spike/prisma7-pglite-spike.mjs');
    const start = spike.indexOf('const CRITERIA = [');
    const end = spike.indexOf('\n];', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = spike.slice(start, end);
    const wired = new Set<string>();
    for (const m of block.matchAll(/\[\s*([0-9]+)\s*,/g)) wired.add(m[1]);
    for (const m of block.matchAll(/\[\s*'([0-9]+[a-z])'\s*,/g)) wired.add(m[1]);
    for (const m of block.matchAll(/^\s+([0-9]+)\s*,\s*$/gm)) wired.add(m[1]);
    for (const m of spike.matchAll(/record\(\s*([0-9]+)\s*,/g)) wired.add(m[1]);
    for (let id = 0; id <= 12; id += 1) {
      expect(wired.has(String(id)), `spike criterion #${id} not wired to a runner`).toBe(true);
    }
    expect(spike).toContain("EXPECTED_FAILS = new Set(['6b'])");
  });

  it('reflects the migration in the project documentation', () => {
    expect(read('AGENTS.md')).toMatch(/no PostgreSQL \(PGlite\)/);
    expect(read('README.md')).toMatch(/Prisma 7/);
    const encryptionRow = read('DEPLOY.md')
      .split('\n')
      .find((line) => line.includes('`ENCRYPTION_KEY`'));
    expect(encryptionRow).toContain('**Deprecated**');
    expect(read('docs/setup-guide.md')).toContain('npx prisma generate');
  });
});
