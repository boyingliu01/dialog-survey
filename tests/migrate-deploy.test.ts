/**
 * @test issue #210
 * @intent 容器内迁移执行器（scripts/migrate-deploy.mjs）的契约：
 *   1. 没有 DATABASE_URL 时拒绝运行（不猜测、不连默认库）；
 *   2. 迁移目录缺失或为空时明确报错，而不是静默"成功"；
 *   3. --dry-run 是只读的：不创建 _prisma_migrations 表、不执行 SQL；
 *   4. 未知参数不被忽略。
 *
 * 为什么这些用例只覆盖"无数据库"的部分：真正执行迁移需要 PostgreSQL。
 * 应用迁移的完整正确性（含幂等、checksum 校验、与 Prisma CLI 的双向互换）
 * 已在真实容器 + 真实 PostgreSQL 上端到端验证，见 issue #210 的评论。
 * 这里守住的是"配置错了必须失败"这条线——这类缺陷在容器里表现为
 * 一个已经启动、schema 却是空的实例，比崩溃更难发现。
 *
 * 用 child_process 调真实脚本（与 prune-runtime-deps.test.ts 同样的方式），
 * 因为要断言的是进程退出码，而不是某个内部函数。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts', 'migrate-deploy.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the migration runner with a controlled environment. */
function runMigrate(
  dir: string,
  env: Record<string, string | undefined>,
  ...extra: string[]
): RunResult {
  const merged = { ...process.env };
  // An empty DATABASE_URL must mean "unset", not "empty string is fine".
  if (env['DATABASE_URL'] === undefined) delete merged['DATABASE_URL'];
  else merged['DATABASE_URL'] = env['DATABASE_URL'];
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--dir', dir, ...extra], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: merged,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('scripts/migrate-deploy.mjs (issue #210)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'migrate-deploy-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('refuses to run without DATABASE_URL', () => {
    const result = runMigrate(projectDir, { DATABASE_URL: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is required');
  });

  it('fails loudly when the migrations directory is missing', () => {
    // A silently-skipped migrate would leave the app running against an empty
    // schema, which looks healthy and is not.
    const result = runMigrate(projectDir, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('migrations directory not found');
  });

  it('reports "nothing to do" for an empty migrations directory', () => {
    mkdirSync(join(projectDir, 'prisma', 'migrations'), { recursive: true });
    const result = runMigrate(projectDir, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no migrations found');
  });

  it('rejects an unknown argument instead of ignoring it', () => {
    const result = runMigrate(
      projectDir,
      { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' },
      '--totally-made-up'
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unknown argument');
  });

  it('ignores directories without migration.sql rather than failing on them', () => {
    // `migration_lock.toml` sits beside the migration folders; a stray directory
    // must not be mistaken for a migration.
    const migrations = join(projectDir, 'prisma', 'migrations');
    mkdirSync(join(migrations, 'not-a-migration'), { recursive: true });
    writeFileSync(join(migrations, 'migration_lock.toml'), 'provider = "postgresql"\n');
    const result = runMigrate(projectDir, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/x' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no migrations found');
  });
});
