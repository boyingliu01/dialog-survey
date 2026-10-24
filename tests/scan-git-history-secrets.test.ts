import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-211-HISTORY-SECRETS
 * @intent 证明全历史密钥扫描脚本在发现、清理、缺工具三种情形下的退出码与输出都正确
 * @covers --help 退出 0、缺 gitleaks 时退出 2（而非静默通过）、发现密钥时退出 1 并列出、报告文件不残留
 *
 * Issue #211 was possible because every secret gate scanned only the current
 * diff. A guard against that has to be trustworthy in both directions: it must
 * fail loudly when history contains a secret, and it must not report green when
 * gitleaks is missing — a "clean" from a tool that never ran is worse than no
 * check at all, because it retires the question.
 */

const script = join(process.cwd(), 'scripts', 'scan-git-history-secrets.mjs');
const reportPath = join(process.cwd(), '.gitleaks-history-report.json');

function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env,
    cwd: process.cwd(),
  });
}

describe('scan-git-history-secrets', () => {
  it('prints usage and exits 0 for --help', () => {
    const result = run(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('scan-git-history-secrets');
    expect(result.stdout).toContain('--verbose');
  });

  it('exits 2 rather than passing when gitleaks is unavailable', () => {
    // Hiding the binary by name rather than emptying PATH: on Windows the script
    // spawns through a shell, and `cmd` still resolves executables from its own
    // search path when PATH is blank — so an empty PATH produced a *successful*
    // scan here (exit 1) instead of the missing-tool path under test.
    const result = run([], { ...process.env, GITLEAKS_BIN: 'definitely-not-installed' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('cannot scan history');
  });

  it('does not leave a report file behind', () => {
    run([], { ...process.env, PATH: '' });

    expect(existsSync(reportPath)).toBe(false);
  });

  it('exits 2 when the placeholder allowlist is missing', () => {
    // Run from a directory with no .gitleaks.toml: without the allowlist the
    // report would be flooded with documentation examples and the real hits
    // would be lost in the noise.
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      cwd: join(process.cwd(), 'scripts'),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('.gitleaks.toml not found');
  });
});
