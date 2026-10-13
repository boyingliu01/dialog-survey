import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf-8');
}

/**
 * Files guarded against pointing at the bare dist/src/server.js entry.
 * Collected dynamically instead of a hardcoded whitelist so new deployment
 * docs are covered automatically (review finding on #194/#195): every
 * top-level *.md, everything under docs/, every shell script under scripts/,
 * plus the container files. Historical records are excluded (CHANGELOG.md,
 * docs/sprints/ — they legitimately mention past mistakes), as is
 * scripts/cli.mjs, which legitimately checks for dist/src/server.js
 * *existence* in verifyInstallation (a file check, not an entry-point
 * instruction).
 */
function collectGuardedFiles(): string[] {
  const files = new Set<string>(['README.md', 'README.zh-CN.md', 'DEPLOY.md', 'Dockerfile']);
  for (const compose of ['docker-compose.yml', 'docker-compose.yaml']) {
    if (existsSync(resolve(repoRoot, compose))) files.add(compose);
  }
  for (const name of readdirSync(repoRoot)) {
    if (name.endsWith('.md') && name !== 'CHANGELOG.md') files.add(name);
  }
  for (const entry of readdirSync(resolve(repoRoot, 'docs'), { recursive: true })) {
    const rel = String(entry).replaceAll('\\', '/');
    if (rel.endsWith('.md') && !rel.startsWith('sprints/')) files.add(join('docs', rel));
  }
  for (const name of readdirSync(resolve(repoRoot, 'scripts'))) {
    if (name.endsWith('.sh')) files.add(join('scripts', name));
  }
  return [...files];
}

describe('deployment docs entry points (#194)', () => {
  it('should never tell pm2 to start dist/src/server.js', () => {
    for (const doc of collectGuardedFiles()) {
      expect(
        read(doc).includes('pm2 start dist/src/server.js'),
        `${doc} still runs \`pm2 start dist/src/server.js\` — under fork mode the self-start guard never fires and the process exits 0 without listening (issue #187)`
      ).toBe(false);
    }
  });

  it('should not reference the bare dist/src/server.js path in any deployment doc', () => {
    for (const doc of collectGuardedFiles()) {
      expect(
        read(doc).includes('dist/src/server.js'),
        `${doc} still references dist/src/server.js — use the unconditional entry dist/src/server-entry.js`
      ).toBe(false);
    }
  });

  it('should use dist/src/server-entry.js in both README production examples', () => {
    expect(read('README.md')).toContain('pm2 start dist/src/server-entry.js --name dialog-survey');
    expect(read('README.md')).toContain('node dist/src/server-entry.js');
    expect(read('README.zh-CN.md')).toContain(
      'pm2 start dist/src/server-entry.js --name dialog-survey'
    );
    expect(read('README.zh-CN.md')).toContain('node dist/src/server-entry.js');
  });

  it('should boot via the unconditional entry in ecosystem.config.cjs', () => {
    expect(read('ecosystem.config.cjs')).toContain("script: 'dist/src/server-entry.js'");
  });

  it('should have server-entry.ts call startServer() unconditionally', () => {
    // The published entry must not depend on the argv guard — that is the whole
    // point of its existence (#186 / #187).
    expect(read('src/server-entry.ts')).toMatch(/void startServer\(\)/);
  });

  it('should keep the PM2 fork safety net in server.ts (#187/#194)', () => {
    // `pm2 start dist/src/server.js` (old muscle memory / third-party guides)
    // must still boot: pm_exec_path identifies this file as the fork target.
    const server = read('src/server.ts');
    expect(server).toContain('pm_exec_path');
    expect(server).toMatch(/pmScriptName === 'server\.js'/);
  });

  it('should keep the Windows backslash-safe argv normalization in server.ts', () => {
    // normalize() converts win32 backslash argv[1] (e.g. dist\src\server.js)
    // before pathToFileURL, so `node dist\src\server.js` on Windows still
    // matches import.meta.url. Dropping normalize() is the regression.
    const server = read('src/server.ts');
    expect(server).toMatch(/const normalizedArg = normalize\(process\.argv\[1\]\)/);
    expect(server).toMatch(/pathToFileURL\(normalizedArg\)/);
  });

  it('should document the pm2 save secret-persistence caveat in both READMEs (#193)', () => {
    for (const doc of ['README.md', 'README.zh-CN.md']) {
      const content = read(doc);
      expect(content).toContain('dump.pm2');
      expect(content).toContain('chmod 700 ~/.pm2 && chmod 600 ~/.pm2/dump.pm2');
    }
  });

  it('should not overstate the #193 protection — plain pm2 restart keeps a stale env', () => {
    // The PM2 env is only refreshed by --update-env; claiming the installer
    // "never passes secrets" hid the upgrade-path leak (review finding).
    expect(read('README.md')).toContain('--update-env');
    expect(read('README.zh-CN.md')).toContain('--update-env');
  });
});
