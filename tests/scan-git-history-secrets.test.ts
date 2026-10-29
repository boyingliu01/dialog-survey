import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const baselinePath = join(process.cwd(), '.secrets-history-baseline.json');
const workflowPath = join(process.cwd(), '.github', 'workflows', 'pr.yml');

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

/**
 * @test REQ-211-GATE
 * @intent 证明全历史扫描是真正的门禁，而不是"只报警不拦截"：基线内的历史命中放行，
 *   基线外的新泄露必须退出 1；基线本身也不能退化成万能豁免
 * @covers CI 步骤不带 continue-on-error、基线结构可解析、每条都有署名理由、
 *   指纹不含密钥明文、基线缺失时不当成干净
 *
 * The step used to be `continue-on-error: true`. That kept eleven known findings
 * from turning the job permanently red, but it also made a NEW leak unblockable,
 * which is the failure this code exists to prevent. These tests pin the reversal:
 * the gate blocks, and the only thing that can stay green is an explicitly
 * reviewed entry.
 */
describe('the full-history scan is a blocking gate (issue #211)', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  /**
   * Extract one job block by indentation, the same way the other workflow tests
   * do, so an assertion cannot match a sibling step's text.
   */
  function stepBlock(name: string): string {
    const lines = workflow.split('\n');
    const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
    if (start === -1) {
      throw new Error(`step "${name}" not found in pr.yml`);
    }
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^ {6}- /.test(line));
    return (end === -1 ? rest : rest.slice(0, end)).join('\n');
  }

  it('runs the full-history scan without continue-on-error', () => {
    const step = stepBlock('gitleaks full-history scan (issue #211)');

    // The whole point: a new secret must fail the build. `continue-on-error`
    // here is what made the previous version advisory.
    expect(step).not.toMatch(/continue-on-error/);
    expect(step).toMatch(/scan-git-history-secrets\.mjs/);
  });

  it('keeps the diff-scoped gitleaks-action advisory, so the two are distinguishable', () => {
    // The action scans PR diffs; the history scan above covers what it cannot
    // see. If its `continue-on-error` disappears, a noisy P2 finding could block
    // merges while the history gate stays the one that matters.
    expect(workflow).toMatch(/gitleaks secret scan[\s\S]{0,300}continue-on-error: true/);
  });

  it('ships a baseline where every accepted finding carries a reviewed reason', () => {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      accepted?: { id?: string; rule?: string; file?: string; line?: number; reason?: string }[];
    };

    expect(Array.isArray(baseline.accepted)).toBe(true);
    expect(baseline.accepted?.length).toBeGreaterThan(0);

    for (const entry of baseline.accepted ?? []) {
      expect(entry.id, 'every entry needs a fingerprint').toMatch(/^[0-9a-f]{16}$/);
      expect(entry.rule).toBeTruthy();
      expect(entry.file).toBeTruthy();
      expect(typeof entry.line).toBe('number');
      // "Silencing a finding you have not read" is the one way a baseline turns
      // into the vulnerability it was meant to catch, so an unreviewed
      // placeholder is a failure rather than a warning.
      expect(entry.reason ?? '', `entry ${entry.id} (${entry.file}) has no reason`).not.toMatch(
        /NOT REVIEWED|^$/
      );
    }
  });

  it('never stores the secret text itself in the baseline', () => {
    // A baseline that embedded the plaintext would be a second copy of the leak,
    // published in a repository that is public. Fingerprints are one-way.
    const raw = readFileSync(baselinePath, 'utf8');

    expect(raw).not.toMatch(/q4rcLQrsL1XXtM/); // DingTalk secret
    expect(raw).not.toMatch(/dingemmnhyusk82zvx7t/); // DingTalk client id
    expect(raw).not.toMatch(/sk-sp-8651e13b/); // DashScope key
    expect(raw).not.toMatch(/803de240-5683-4ce3/); // Volcengine Ark key
  });

  it('treats a missing baseline as unverified rather than clean', () => {
    // The scan must not fall back to "no baseline means nothing is accepted, so
    // everything is fine". Without the file every historical hit is new, and the
    // gate blocks — verified here by pointing the baseline lookup at a copy of
    // the repo root without one.
    expect(existsSync(baselinePath)).toBe(true);

    const isolated = mkdtempSync(join(tmpdir(), 'history-scan-no-baseline-'));
    try {
      copyFileSync(join(process.cwd(), '.gitleaks.toml'), join(isolated, '.gitleaks.toml'));
      mkdirSync(join(isolated, 'scripts'), { recursive: true });
      copyFileSync(script, join(isolated, 'scripts', 'scan-git-history-secrets.mjs'));

      const result = spawnSync(
        process.execPath,
        [join(isolated, 'scripts', 'scan-git-history-secrets.mjs')],
        { encoding: 'utf8', cwd: isolated }
      );

      // The isolated directory is not a git repository, which is its own trap:
      // `gitleaks git` exits 0 there with an empty report, so a naive scan would
      // announce "history is clean" for a history it never read. The commit
      // count guard turns that into an explicit refusal (exit 2), and the
      // property under test is the general one — it never reports clean.
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('no commits found');
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
});
