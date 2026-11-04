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

  it('reports the real toolchain as matching', () => {
    const { code, stdout } = runVerifier();
    expect(code).toBe(0);
    expect(stdout).toMatch(/ok\s+lizard/);
    // All three gates' tools must be probed, not just the one that motivated this.
    for (const tool of ['lizard', 'semgrep', 'detect-secrets']) {
      expect(stdout).toMatch(new RegExp(`ok\\s+${tool}`));
    }
  });

  it('fails when a pinned version disagrees with what is installed', () => {
    const config = readConfig() as Record<string, { pinned: string }>;
    // Pretend the pin was 0.0.1 — a version no real tool reports.
    config['lizard'] = { ...config['lizard'], pinned: '0.0.1' } as { pinned: string };
    const path = join(dir, 'gate-tools.json');
    writeFileSync(path, JSON.stringify(config));

    const { code, stdout } = runVerifier(path);
    expect(code).toBe(1);
    expect(stdout).toMatch(/FAIL\s+lizard/);
    expect(stdout).toMatch(/pinned 0\.0\.1/);
  });

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
