import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * These are behavioural tests of the complexity gate itself. `scripts/ccn-report.cjs`
 * decides whether `npm run complexity` and the xp-gate ratchet pass, so a
 * measurement bug here silently reports "no functions exceed the threshold"
 * while real complexity goes unmeasured — which is exactly what happened: the
 * method-shorthand branch treated `for (...) {` and `catch (e) {` as nested
 * functions, blanking the bodies and hiding every `if`/`&&` inside them.
 *
 * The script has no module exports (it is a CLI), so it is exercised the way the
 * gate uses it: as a subprocess over a throwaway project tree.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'ccn-report.cjs');

function run(args: string[], cwd: string): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', code: e.status ?? 1 };
  }
}

/** Write `src/<name>.ts` into the fixture project and measure it. */
function measure(source: string, threshold = 1): string {
  writeFileSync(join(fixture, 'src', 'probe.ts'), source, 'utf8');
  return run(['--threshold', String(threshold), '--report-only'], fixture).stdout;
}

/** Extract the reported CCN for a named function, or null when absent. */
function ccnOf(stdout: string, name: string): number | null {
  const line = stdout.split('\n').find((l) => l.includes(` ${name} `) || l.endsWith(` ${name}`));
  if (!line) return null;
  const m = line.match(/CCN\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'ccn-gate-'));
  mkdirSync(join(fixture, 'src'), { recursive: true });
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('ccn-report gate measurement', () => {
  it('counts a straight-line function as CCN 1', () => {
    const out = measure('export function flat(): number {\n  return 1;\n}\n');
    expect(ccnOf(out, 'flat')).toBeNull(); // CCN 1 <= threshold 1 is not reported
  });

  it('counts if/else-if/else as one decision each', () => {
    const out = measure(
      [
        'export function branchy(x: number): number {',
        '  if (x > 1) {',
        '    return 1;',
        '  } else if (x < 0) {',
        '    return 2;',
        '  }',
        '  return 0;',
        '}',
      ].join('\n')
    );
    // if + else-if = 2 decisions, CCN 3
    expect(ccnOf(out, 'branchy')).toBe(3);
  });

  it('counts && and || as decision points', () => {
    const out = measure(
      [
        'export function ops(a: number, b: number, c: number): number {',
        '  if (a > 0 && b > 0 && c > 0) {',
        '    return 1;',
        '  }',
        '  return 0;',
        '}',
      ].join('\n')
    );
    // if + two && = 3 decisions, CCN 4
    expect(ccnOf(out, 'ops')).toBe(4);
  });

  it('sees decisions nested inside a for loop', () => {
    // Regression: `for (const x of xs) {` matched the method-shorthand branch
    // and had its whole body masked, so the inner `if` disappeared.
    const out = measure(
      [
        'export function inLoop(xs: number[]): number {',
        '  let n = 0;',
        '  for (const x of xs) {',
        '    if (x > 0) {',
        '      n += 1;',
        '    }',
        '  }',
        '  return n;',
        '}',
      ].join('\n')
    );
    // for + if = 2 decisions, CCN 3
    expect(ccnOf(out, 'inLoop')).toBe(3);
  });

  it('sees a catch nested inside a loop', () => {
    const out = measure(
      [
        'export function tryInLoop(xs: number[]): number {',
        '  let n = 0;',
        '  for (const x of xs) {',
        '    try {',
        '      n += x;',
        '    } catch {',
        '      n -= 1;',
        '    }',
        '  }',
        '  return n;',
        '}',
      ].join('\n')
    );
    // for + catch = 2 decisions, CCN 3
    expect(ccnOf(out, 'tryInLoop')).toBe(3);
  });

  it('does not count a nested arrow function towards its parent', () => {
    const out = measure(
      [
        'export function outer(xs: number[]): number[] {',
        '  return xs.map((x) => {',
        '    if (x > 0 && x < 10) {',
        '      return x;',
        '    }',
        '    return 0;',
        '  });',
        '}',
      ].join('\n')
    );
    // Only `if` + `&&` inside the arrow; parent stays at CCN 1 and is unreported.
    expect(ccnOf(out, 'outer')).toBeNull();
  });

  it('fails with a non-zero exit when a function exceeds the threshold', () => {
    writeFileSync(
      join(fixture, 'src', 'bad.ts'),
      [
        'export function tooComplex(a: number, b: number): number {',
        '  if (a && b) { return 1; }',
        '  if (a || b) { return 2; }',
        '  if (a && !b) { return 3; }',
        '  return 0;',
        '}',
      ].join('\n'),
      'utf8'
    );
    const result = run(['--threshold', '3'], fixture);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('tooComplex');
  });

  it('passes with a zero exit when every function is under the threshold', () => {
    writeFileSync(
      join(fixture, 'src', 'fine.ts'),
      'export function fine(): number {\n  return 1;\n}\n',
      'utf8'
    );
    const result = run(['--threshold', '10'], fixture);
    expect(result.code).toBe(0);
  });

  describe('object return-type annotations', () => {
    // Regression: `function f(): { a: string } { … }` had its type literal taken
    // for the body, so a CCN-8 function was reported as CCN 1 and its real body
    // was never inspected. `mapServiceErrorToStatus` in src/api/plans.ts was the
    // production victim.
    it('measures the body, not the return-type literal', () => {
      const out = measure(
        [
          'export function typed(x: unknown): { status: number; message: string } {',
          '  if (x) { return { status: 1, message: "a" }; }',
          '  if (!x) { return { status: 2, message: "b" }; }',
          '  if (x === null) { return { status: 3, message: "c" }; }',
          '  return { status: 0, message: "" };',
          '}',
        ].join('\n')
      );
      // three `if` decisions, CCN 4 — the type literal must not be counted
      expect(ccnOf(out, 'typed')).toBe(4);
    });

    it('measures the body behind a union return type', () => {
      const out = measure(
        [
          'export function union(a: number): { ok: true } | { ok: false } {',
          '  if (a > 1) { return { ok: true }; }',
          '  if (a < 0) { return { ok: false }; }',
          '  return { ok: false };',
          '}',
        ].join('\n')
      );
      expect(ccnOf(out, 'union')).toBe(3);
    });
  });

  describe('class methods', () => {
    // Regression: methods matched neither recognised declaration form, so 170
    // methods — including an 8-method group above the threshold — were never
    // measured and could never appear in the baseline.
    it('measures a method with a return-type annotation', () => {
      const out = measure(
        [
          'export class Svc {',
          '  async run(x: number): Promise<string> {',
          '    if (x > 1) { return "a"; }',
          '    if (x < 0) { return "b"; }',
          '  }',
          '}',
        ].join('\n')
      );
      expect(ccnOf(out, 'run')).toBe(3);
    });

    it('measures a private method and does not charge it to the class', () => {
      const out = measure(
        [
          'export class Svc {',
          '  private check(a: number, b: number): boolean {',
          '    if (a && b) { return false; }',
          '    if (a || b) { return false; }',
          '    return true;',
          '  }',
          '}',
        ].join('\n')
      );
      // two `if` + `&&` + `||` = 4 decisions, CCN 5
      expect(ccnOf(out, 'check')).toBe(5);
    });

    it('counts a constructor body', () => {
      const out = measure(
        [
          'export class Svc {',
          '  constructor(public a?: number) {',
          '    if (a === undefined) { this.a = 0; }',
          '    if (a !== undefined && a < 0) { this.a = 0; }',
          '  }',
          '  a: number = 0;',
          '}',
        ].join('\n')
      );
      // two `if` + `&&` = 3 decisions, CCN 4
      expect(ccnOf(out, 'constructor')).toBe(4);
    });
  });

  describe('nested function attribution', () => {
    it('does not charge a callback to the registration function', () => {
      const out = measure(
        [
          'declare const app: { get(p: string, h: () => void): void };',
          'export function register(): void {',
          '  app.get("/a", () => {',
          '    if (1) { return; }',
          '  });',
          '  app.get("/b", () => {',
          '    if (2) { return; }',
          '  });',
          '}',
        ].join('\n')
      );
      // The two inline handlers own their `if`s; register stays at CCN 1.
      expect(ccnOf(out, 'register')).toBeNull();
    });

    it('measures a method nested in a class and an arrow field separately', () => {
      const out = measure(
        [
          'export class Svc {',
          '  run = (x: number) => {',
          '    if (x) { return 1; }',
          '  };',
          '}',
        ].join('\n')
      );
      expect(ccnOf(out, 'run')).toBe(2);
    });
  });

  describe('concise arrow bodies', () => {
    it('measures an expression-bodied arrow instead of skipping it', () => {
      // `.filter((r) => a && b ? c : d)` is a real function with real branches.
      // Requiring a block body excluded every one of them from the gate.
      const out = measure(
        [
          'export const pick = (a: number, b: number): number =>',
          '  a && b ? (a || b ? 1 : 2) : 3;',
        ].join('\n')
      );
      // `&&` + `||` + two ternaries = 4 decisions, CCN 5
      expect(ccnOf(out, 'pick')).toBe(5);
    });

    it('counts a `??` in a concise body', () => {
      const out = measure('export const or = (a?: string, b?: string): string => a ?? b ?? "";');
      // two `??` = 2 decisions, CCN 3
      expect(ccnOf(out, 'or')).toBe(3);
    });

    it('does not charge a concise nested arrow to its parent', () => {
      const out = measure(
        [
          'export function outer(xs: number[]): number[] {',
          '  return xs.filter((x) => x > 1 && x < 9);',
          '}',
        ].join('\n')
      );
      // The callback owns its `&&`; outer stays at CCN 1 and is not reported.
      expect(ccnOf(out, 'outer')).toBeNull();
    });
  });

  describe('fail-closed behaviour', () => {
    it('exits non-zero when a file cannot be parsed', () => {
      // Silently skipping an unparsable file is how a module can stay unmeasured
      // while the gate still reports success.
      writeFileSync(join(fixture, 'src', 'probe.ts'), 'export function x( {\n', 'utf8');
      const result = run(['--threshold', '10', '--report-only'], fixture);
      expect(result.code).toBe(1);
    });
  });

  describe('--csv-verified (what xp-gate Gate 3 pipes through)', () => {
    /** Feed a lizard-style CSV row through --csv-verified; return stdout+code. */
    function verify(csv: string): { stdout: string; code: number } {
      try {
        const stdout = execFileSync(
          process.execPath,
          [SCRIPT, '--csv-verified', 'batch', '--root', fixture],
          { cwd: fixture, encoding: 'utf8', input: csv, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return { stdout, code: 0 };
      } catch (err) {
        const e = err as { stdout?: string; status?: number };
        return { stdout: e.stdout ?? '', code: e.status ?? 1 };
      }
    }

    /** Columns 1..11 of lizard's CSV, with a deliberately wrong CCN at index 1. */
    function lizardRow(name: string, startLine: number, ccn: number): string {
      const path = join(fixture, 'src', 'probe.ts');
      return [
        '10', // NLOC
        String(ccn),
        '40', // token_len
        '2', // param_count
        '20',
        `${name}@${startLine}-${startLine + 5}@${path}`,
        path,
        name,
        `function ${name}()`,
        String(startLine),
        String(startLine + 5),
      ].join(',');
    }

    it("replaces lizard's CCN with the AST's", () => {
      // lizard says 2; the body has two `if`s plus `&&`, so the answer is CCN 4.
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        [
          'export function real(a: number, b: number): number {',
          '  if (a && b) { return 1; }',
          '  if (a) { return 2; }',
          '  return 0;',
          '}',
        ].join('\n'),
        'utf8'
      );
      const { stdout, code } = verify(lizardRow('real', 1, 2));
      expect(code).toBe(0);
      expect(stdout.split(',')[1]).toBe('4');
    });

    it('drops a row for a simulated interface member rather than grading it', () => {
      // lizard reports `readonly disconnect: () => Promise<void>;` as a function.
      // It is a type, so the row must be discarded while the batch still passes.
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        ['export interface C {', '  readonly disconnect: () => Promise<void>;', '}'].join('\n'),
        'utf8'
      );
      const { stdout, code } = verify(lizardRow('disconnect', 2, 3));
      expect(code).toBe(0);
      expect(stdout.trim()).toBe('');
    });

    it('drops a row naming a non-function on a line that holds no implementation', () => {
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        ['export const value = 1;', 'export function present(): void {}'].join('\n'),
        'utf8'
      );
      // Line 1 is a variable, not a function implementation, so there is nothing
      // to grade: the row is discarded and the batch still passes.
      const { stdout, code } = verify(lizardRow('value', 1, 2));
      expect(code).toBe(0);
      expect(stdout.trim()).toBe('');
    });

    it('keeps a row whose function the AST can measure', () => {
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        ['export function plain(): void {}'].join('\n'),
        'utf8'
      );
      const { stdout, code } = verify(lizardRow('plain', 1, 9));
      expect(code).toBe(0);
      expect(stdout.split(',')[1]).toBe('1');
    });
  });
});
