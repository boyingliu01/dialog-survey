import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTemplateDataDir } from './helpers/pglite-template.js';
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

function jobBlock(yml: string, job: string): string {
  const lines = yml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) throw new Error(`job not found: ${job}`);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(line) || /^[A-Za-z#]/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
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
    const excludeArray = read('tsconfig.json').match(/"exclude"\s*:\s*\[[^\]]*\]/)?.[0] ?? '';
    expect(excludeArray).not.toContain('generated');
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
 * .sprint-state/phase-outputs/ac003-timing-and-memory-evidence.md — 壁钟断言在全量并行下不稳定。
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
 * @test REQ-PRISMA7-004
 * @intent AC-PRISMA7-004-01 workflows 不再声明 postgres service / db push，node 版本取自
 * .nvmrc；AC-PRISMA7-004-02 六个消费 job 与 publish job 的 prisma generate 先于 tsc/vitest/build。
 * @covers AC-PRISMA7-004-01, AC-PRISMA7-004-02
 */
describe('CI workflows are PG-free and generate-first (AC-004)', () => {
  const pr = read('.github/workflows/pr.yml');
  const publish = read('.github/workflows/publish.yml');

  it('declares no postgres service and no db push step', () => {
    for (const yml of [pr, publish]) {
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
      ['coverage', pr, ['npx vitest --coverage']],
      ['e2e-tests', pr, ['npx vitest run']],
      ['smoke', pr, ['npm run smoke']],
      ['publish', publish, ['npm run test:coverage', 'npm run build']],
    ];
    for (const [job, yml, consumers] of generatingJobs) {
      const block = jobBlock(yml, job);
      const generateAt = block.indexOf('npx prisma generate');
      expect(generateAt, `${job}: generate step missing`).toBeGreaterThan(-1);
      for (const consumer of consumers) {
        const consumerAt = block.indexOf(consumer);
        expect(consumerAt, `${job}: ${consumer} not found`).toBeGreaterThan(-1);
        expect(generateAt, `${job}: generate must precede ${consumer}`).toBeLessThan(consumerAt);
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
    expect((cli.match(/prisma\.config\.ts/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(cli).toMatch(/prisma@\d+\.\d+\.\d+ db push/);
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

  it('keeps spike criteria #0-#12 present in the harness', () => {
    const spike = read('tools/spike/prisma7-pglite-spike.mjs');
    for (let id = 0; id <= 12; id += 1) {
      const declared =
        spike.includes(`[${id},`) ||
        spike.includes(`['${id}',`) ||
        new RegExp(`function c${id}_`).test(spike) ||
        spike.includes(`#${id} `);
      expect(declared, `spike criterion #${id} missing`).toBe(true);
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
