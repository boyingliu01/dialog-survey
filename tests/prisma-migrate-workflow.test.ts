import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * @test ISSUE-152
 * @intent AC-152-01 生产部署路径使用 prisma migrate deploy（不再 db push）；
 * AC-152-02 初始迁移文件已提交且与 schema.prisma 一致；
 * AC-152-03 DEPLOY.md 描述迁移工作流。
 * @covers AC-152-01, AC-152-02, AC-152-03
 */
describe('prisma migrate workflow (issue #152)', () => {
  const migrationsDir = 'prisma/migrations';

  it('commits an initial migration with a lockfile', () => {
    expect(existsSync(join(migrationsDir, 'migration_lock.toml'))).toBe(true);
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(existsSync(join(migrationsDir, dir, 'migration.sql'))).toBe(true);
    }
  });

  it('ships the migration files to installers and containers', () => {
    // package.json "files" already ships prisma/ recursively; the installer
    // copies prisma/ wholesale — assert both so a future narrowing is caught.
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { files: string[] };
    expect(pkg.files).toContain('prisma/');
    const cli = readFileSync('scripts/cli.mjs', 'utf-8');
    expect(cli).toMatch(/const filesToCopy = \[[\s\S]*?'prisma',/);
  });

  it('uses prisma migrate deploy instead of db push on every production path', () => {
    const deploySh = readFileSync('scripts/deploy.sh', 'utf-8');
    expect(deploySh).toContain('prisma migrate deploy');
    expect(deploySh).not.toMatch(/prisma db push/);

    const cli = readFileSync('scripts/cli.mjs', 'utf-8');
    expect(cli).toContain('prisma@7.10.0 migrate deploy');
    // Match command positions only (exec argument), not prose comments.
    expect(cli).not.toMatch(/exec\(\s*['"][^'"]*db push/);
  });

  it('documents the migrate workflow in DEPLOY.md', () => {
    const deployDoc = readFileSync('DEPLOY.md', 'utf-8');
    expect(deployDoc).toContain('prisma migrate deploy');
    expect(deployDoc).not.toMatch(/npx prisma db push/);
  });
});
