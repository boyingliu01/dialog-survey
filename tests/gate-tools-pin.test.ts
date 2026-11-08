import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Guards for tools/gate-tools.json and the script that enforces it.
 *
 * The point of the pin is that a `pip install -U` cannot silently change what
 * Gate 3 measures. These tests assert the *mechanism*, not the concrete version
 * numbers: asserting "lizard is 1.25.0" would make the suite fail on any machine
 * with a different (but equally valid) pin, and would say nothing about whether
 * drift is actually detected.
 */

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'verify-gate-tools.cjs');
const CONFIG = join(import.meta.dirname, '..', 'tools', 'gate-tools.json');

interface GateToolsConfig {
  [key: string]: unknown;
}

function readConfig(): GateToolsConfig {
  return JSON.parse(readFileSync(CONFIG, 'utf8')) as GateToolsConfig;
}

/** Run the verifier against a config file of our choosing. */
function runVerifier(configPath?: string): { code: number; stdout: string; stderr: string } {
  const env = { ...process.env };
  if (configPath) env['GATE_TOOLS_CONFIG'] = configPath;
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Whether every pinned tool is actually installed on this machine.
 *
 * The verifier exits 1 when a tool is missing, and that is correct behaviour.
 * The consequence for THESE tests is that they can only assert anything where
 * the tools exist. They used to assert unconditionally, so the npm publish job
 * on a bare `ubuntu-latest` runner printed `FAIL lizard —` (no version at all)
 * and failed the release — twice, v1.14.1 and v1.19.0.
 *
 * The gate toolchain is a local-development prerequisite (`xp-gate bootstrap`),
 * not a CI dependency; `tools/gate-tools.json` exists so a developer's
 * `pip install -U` cannot silently move what Gate 3 measures. Skipping when the
 * tools are absent does not weaken the guarantee: the drift mechanism is still
 * asserted on every machine that has them, and "a missing tool fails" is
 * covered separately by the stub-PATH test below.
 */
function toolchainInstalled(): boolean {
  return runVerifier().code === 0;
}

describe('tools/gate-tools.json', () => {
  it('pins lizard at or above 1.24.1, where -Ecognitive landed', () => {
    const config = readConfig() as { lizard: { pinned: string; minimum: string } };
    expect(config.lizard.minimum).toBe('1.24.1');

    const [major, minor] = config.lizard.pinned.split('.').map(Number);
    const atLeast = major > 1 || (major === 1 && (minor ?? 0) >= 24);
    expect(
      atLeast,
      `pinned lizard ${config.lizard.pinned} predates the cognitive-complexity feature (1.24.1)`
    ).toBe(true);
  });

  it('gives every pinned tool a reason, so a bump is a recorded decision', () => {
    for (const [name, entry] of Object.entries(readConfig())) {
      if (name.startsWith('$')) continue;
      const { why, pinned } = entry as { why?: string; pinned?: string };
      expect(pinned, `${name} has no pinned version`).toMatch(/^\d+\.\d+/);
      // A bare number with no explanation ages into a mystery the next person
      // "solves" by bumping it. The reason is what makes the pin reviewable.
      expect((why ?? '').length, `${name} has no recorded reason`).toBeGreaterThan(40);
    }
  });

  it('does not carry credentials or paths that differ per machine', () => {
    const text = readFileSync(CONFIG, 'utf8');
    expect(text).not.toMatch(/[A-Za-z]:\\\\/);
    expect(text).not.toMatch(/\/home\/|\/Users\//);
  });
});

describe('scripts/verify-gate-tools.cjs', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gate-tools-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Only meaningful where the tools are installed; see toolchainInstalled() above.
  it.skipIf(!toolchainInstalled())('reports the real toolchain as matching', () => {
    const { code, stdout } = runVerifier();
    expect(code).toBe(0);
    expect(stdout).toMatch(/ok\s+lizard/);
    // All three gates' tools must be probed, not just the one that motivated this.
    for (const tool of ['lizard', 'semgrep', 'detect-secrets']) {
      expect(stdout).toMatch(new RegExp(`ok\\s+${tool}`));
    }
  });

  // Drift detection needs a real installed version to disagree with.
  it.skipIf(!toolchainInstalled())(
    'fails when a pinned version disagrees with what is installed',
    () => {
      const config = readConfig() as Record<string, { pinned: string }>;
      // Pretend the pin was 0.0.1 — a version no real tool reports.
      config['lizard'] = { ...config['lizard'], pinned: '0.0.1' } as { pinned: string };
      const path = join(dir, 'gate-tools.json');
      writeFileSync(path, JSON.stringify(config));

      const { code, stdout } = runVerifier(path);
      expect(code).toBe(1);
      expect(stdout).toMatch(/FAIL\s+lizard/);
      expect(stdout).toMatch(/pinned 0\.0\.1/);
    }
  );

  it('fails when a pinned tool is not installed at all', () => {
    // A tool the config names but no probe covers. This is the shape of a real
    // failure: the pin exists, the binary does not.
    const config = readConfig() as Record<string, unknown>;
    config['nonexistent-tool'] = { pinned: '9.9.9', why: 'x'.repeat(50) };
    const path = join(dir, 'gate-tools.json');
    writeFileSync(path, JSON.stringify(config));

    const { code } = runVerifier(path);
    expect(code).toBe(1);
  });

  it('exits 2, not 0, when the config cannot be read', () => {
    // "Could not check" must never be reported as a pass — the same rule the
    // secret scanners follow when their scanner is missing.
    const path = join(dir, 'broken.json');
    writeFileSync(path, '{ not json');
    const { code } = runVerifier(path);
    expect(code).toBe(2);
  });
});
