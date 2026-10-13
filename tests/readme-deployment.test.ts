import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf-8');
}

// Docs that show how to boot the service in production. Every one of them must
// point at the unconditional entry dist/src/server-entry.js: under PM2 fork
// mode the argv-based self-start guard in dist/src/server.js never fires, so
// starting it produces the "online but dead, empty error log" trap of #187 —
// which the English README re-exposed until #194.
const DEPLOYMENT_DOCS = [
  'README.md',
  'README.zh-CN.md',
  'DEPLOY.md',
  'docs/setup-guide.md',
  'Dockerfile',
];

describe('deployment docs entry points (#194)', () => {
  it('should never tell pm2 to start dist/src/server.js', () => {
    for (const doc of DEPLOYMENT_DOCS) {
      expect(
        read(doc).includes('pm2 start dist/src/server.js'),
        `${doc} still runs \`pm2 start dist/src/server.js\` — under fork mode the self-start guard never fires and the process exits 0 without listening (issue #187)`
      ).toBe(false);
    }
  });

  it('should not reference the bare dist/src/server.js path in any deployment doc', () => {
    for (const doc of DEPLOYMENT_DOCS) {
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

  it('should document the pm2 save secret-persistence caveat in both READMEs (#193)', () => {
    for (const doc of ['README.md', 'README.zh-CN.md']) {
      const content = read(doc);
      expect(content).toContain('dump.pm2');
      expect(content).toContain('chmod 700 ~/.pm2 && chmod 600 ~/.pm2/dump.pm2');
    }
  });
});
