import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * @test REQ-GATE-M-PATCH-01
 * @intent 验证 verify-xp-gate-patches.cjs 能识别出 xp-gate 补丁缺失并给出非 0 退出码
 * @covers 补丁在位时退出 0、缺失时退出 1 并打印症状、--fix 能恢复 pre-push 超时补丁
 *
 * The verifier reads from `~/.config/xp-gate`, which is outside the repo and
 * differs per machine (and may not exist on CI). These tests build a throwaway
 * fake xp-gate tree and point HOME at it, so they assert the *logic* rather than
 * whatever happens to be installed locally.
 */
const SCRIPT = path.resolve('scripts/verify-xp-gate-patches.cjs');

const RUNNER_STUB = [
  'class StrykerRunner {',
  '  async run(options) {',
  "    const args = ['stryker', 'run'];",
  '    return args;',
  '  }',
  '}',
].join('\n');

const RUNNER_PATCHED = [
  'class StrykerRunner {',
  '  async run(options) {',
  '    const configPath = this.resolveConfig(options.cwd);',
  '    const args = [',
  "      'stryker',",
  "      'run',",
  '      ...(configPath ? [configPath] : []),',
  "      '--mutate',",
  "      options.files.join(','),",
  '    ];',
  '    return args;',
  '  }',
  '  private fromAggregates(parsed) { return parsed; }',
  '  private fromMutantList(parsed) { return parsed; }',
  '}',
].join('\n');

const HOOK_ORIGINAL =
  '        RUN_TSX_TIMEOUT=600s run_tsx $MUTATION_SCRIPT --changed-files "$CHANGED_SOURCE_FILES" > "$MUTATION_OUTPUT" 2>&1';
const HOOK_PATCHED =
  '        RUN_TSX_TIMEOUT=3720s run_tsx $MUTATION_SCRIPT --changed-files "$CHANGED_SOURCE_FILES" --timeout 3600000 > "$MUTATION_OUTPUT" 2>&1';

let fakeHome: string;
let originalHome: string | undefined;

function writeFakeXpGate(runnerSource: string, hookSource: string): void {
  const root = path.join(fakeHome, '.config', 'xp-gate');
  fs.mkdirSync(path.join(root, 'modules', 'mutation', 'runners'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'modules', 'mutation', 'runners', 'stryker-runner.ts'),
    runnerSource
  );
  fs.writeFileSync(path.join(root, 'hooks', 'pre-push'), hookSource);
}

interface RunResult {
  status: number;
  output: string;
}

function runVerifier(...extraArgs: string[]): RunResult {
  try {
    const output = execFileSync(process.execPath, [SCRIPT, ...extraArgs], {
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

describe('verify-xp-gate-patches', () => {
  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-gate-verify-'));
    originalHome = process.env['HOME'];
  });

  afterEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    if (originalHome !== undefined) process.env['HOME'] = originalHome;
  });

  it('exits 0 when every patch is present', () => {
    writeFakeXpGate(RUNNER_PATCHED, HOOK_PATCHED);

    const { status, output } = runVerifier();

    expect(status).toBe(0);
    expect(output).toContain('All Gate M patches are in place');
    expect(output).not.toContain('MISSING');
  });

  it('reports a missing --mutate join and names the consequence', () => {
    writeFakeXpGate(RUNNER_STUB, HOOK_PATCHED);

    const { status, output } = runVerifier();

    expect(status).toBe(1);
    expect(output).toContain('MISSING  stryker-runner: --mutate joined with a comma');
    expect(output).toContain('only the last changed file is mutated');
  });

  it('reports the missing schema-1.0 aggregation step', () => {
    writeFakeXpGate(RUNNER_STUB, HOOK_PATCHED);

    const { status, output } = runVerifier();

    expect(status).toBe(1);
    expect(output).toContain('MISSING  stryker-runner: scores aggregated from the mutant list');
    expect(output).toContain('0.0% mutation score');
  });

  it('reports the missing type-check hook timeout', () => {
    writeFakeXpGate(RUNNER_PATCHED, HOOK_ORIGINAL);

    const { status, output } = runVerifier();

    expect(status).toBe(1);
    expect(output).toContain('MISSING  pre-push: explicit --timeout');
    expect(output).toContain('run with --fix to restore it');
  });

  it('--fix restores the hook timeout and then passes', () => {
    writeFakeXpGate(RUNNER_PATCHED, HOOK_ORIGINAL);

    const fixed = runVerifier('--fix');
    expect(fixed.status).toBe(0);
    expect(fixed.output).toContain('Restored 1 patch');

    const hookPath = path.join(fakeHome, '.config', 'xp-gate', 'hooks', 'pre-push');
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('--timeout 3600000');

    // Re-running must be a clean pass, not another restore.
    const after = runVerifier();
    expect(after.status).toBe(0);
    expect(after.output).toContain('All Gate M patches are in place');
  });

  it('--fix does not invent a hook patch it cannot recognise', () => {
    // A future xp-gate may rewrite this line differently; --fix must not
    // silently claim success when the anchor text is gone.
    writeFakeXpGate(RUNNER_PATCHED, '# the call was restructured upstream');

    const { status, output } = runVerifier('--fix');

    expect(status).toBe(1);
    expect(output).toContain('run with --fix to restore it');
    expect(output).not.toContain('Restored');
  });

  it('skips cleanly when xp-gate is not installed', () => {
    const { status, output } = runVerifier();

    expect(status).toBe(0);
    expect(output).toContain('not found — is xp-gate installed?');
  });
});
