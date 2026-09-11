import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('../scripts/sync-version.sh', import.meta.url));

interface Fixture {
  dir: string;
  writePackageJson(relativePath: string, version: string): void;
  writeAgentsHeader(version: string): void;
}

function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'sync-version-'));
  writeFileSync(join(dir, 'VERSION'), '2.3.4\n');
  return {
    dir,
    writePackageJson(relativePath: string, version: string): void {
      const target = join(dir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        `${JSON.stringify(
          { name: 'fixture', version, description: 'keep me', scripts: { test: 'npm test' } },
          null,
          2
        )}\n`
      );
    },
    writeAgentsHeader(version: string): void {
      writeFileSync(
        join(dir, 'AGENTS.md'),
        `> Generated: 2026-07-08. Commit: \`073e69e\` (v${version}). 50 source TS files.\n\n# Body stays untouched (v1.0.0)\n`
      );
    },
  };
}

function runSyncVersion(dir: string): void {
  execSync(`bash "${scriptPath}"`, {
    cwd: dir,
    env: { ...process.env, SYNC_VERSION_ROOT: dir },
    stdio: 'pipe',
  });
}

function readPackageVersion(dir: string, relativePath = 'package.json'): string {
  return (JSON.parse(readFileSync(join(dir, relativePath), 'utf8')) as { version: string }).version;
}

describe('sync-version.sh', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture();
  });

  afterEach(() => {
    rmSync(fixture.dir, { recursive: true, force: true });
  });

  it('propagates the VERSION file into package.json', () => {
    fixture.writePackageJson('package.json', '1.0.0');

    runSyncVersion(fixture.dir);

    expect(readPackageVersion(fixture.dir)).toBe('2.3.4');
  });

  it('preserves unrelated package.json fields', () => {
    fixture.writePackageJson('package.json', '1.0.0');

    runSyncVersion(fixture.dir);

    const pkg = JSON.parse(readFileSync(join(fixture.dir, 'package.json'), 'utf8')) as {
      name: string;
      description: string;
      scripts: { test: string };
    };
    expect(pkg.name).toBe('fixture');
    expect(pkg.description).toBe('keep me');
    expect(pkg.scripts.test).toBe('npm test');
  });

  it('updates every existing package.json target, skipping missing ones', () => {
    fixture.writePackageJson('package.json', '1.0.0');
    fixture.writePackageJson('src/npm-package/package.json', '0.1.0');

    runSyncVersion(fixture.dir);

    expect(readPackageVersion(fixture.dir)).toBe('2.3.4');
    expect(readPackageVersion(fixture.dir, 'src/npm-package/package.json')).toBe('2.3.4');
  });

  it('refreshes the version token in the AGENTS.md header only', () => {
    fixture.writePackageJson('package.json', '1.0.0');
    fixture.writeAgentsHeader('1.8.0');

    runSyncVersion(fixture.dir);

    const agents = readFileSync(join(fixture.dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('(v2.3.4)');
    expect(agents).not.toContain('(v1.8.0)');
    expect(agents).toContain('# Body stays untouched (v1.0.0)');
  });

  it('fails closed and leaves package.json untouched when VERSION is invalid', () => {
    fixture.writePackageJson('package.json', '1.0.0');
    writeFileSync(join(fixture.dir, 'VERSION'), 'not-a-version\n');

    expect(() => runSyncVersion(fixture.dir)).toThrow();
    expect(readPackageVersion(fixture.dir)).toBe('1.0.0');
  });

  it('lists its fan-out targets for the pre-commit hook without touching anything', () => {
    fixture.writePackageJson('package.json', '1.0.0');
    fixture.writeAgentsHeader('1.8.0');
    const versionBefore = readFileSync(join(fixture.dir, 'VERSION'), 'utf8');

    const output = `${execSync(`bash "${scriptPath}" --list-targets`, {
      cwd: fixture.dir,
      env: { ...process.env, SYNC_VERSION_ROOT: fixture.dir },
      stdio: ['pipe', 'pipe', 'ignore'],
    })}`;

    const targets = output.trim().split('\n');
    expect(targets).toContain('package.json');
    expect(targets).toContain('AGENTS.md');
    expect(readPackageVersion(fixture.dir)).toBe('1.0.0');
    expect(readFileSync(join(fixture.dir, 'VERSION'), 'utf8')).toBe(versionBefore);
  });
});
