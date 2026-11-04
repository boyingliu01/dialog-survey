import { execFileSync, spawnSync } from 'node:child_process';
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

/**
 * Split one CSV line, honouring double-quote escaping.
 *
 * Deliberately a separate implementation from the one in `ccn-report.cjs`: a test
 * that reused the production splitter would agree with it about what the output
 * means, so a quoting bug would look like a correct round-trip.
 */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
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

    it('exits 2 when an explicitly named scan root does not exist', () => {
      // This was a REAL false negative. `resolveFiles` used to `continue` past a
      // missing root, so a typo produced "No functions exceed the threshold" and
      // exit 0 for a directory nothing had read -- a clean bill of health for an
      // unread tree, which is the one verdict this script must never give. Exit 2
      // ("no evidence") is deliberately distinct from 1 ("debt found") so the two
      // cannot be confused.
      //
      // Only an EXPLICIT root is fatal: a default root is "where debt usually
      // lives", and a project without a `prisma/` directory must still measure.
      const result = run(
        ['--threshold', '10', join(fixture, 'no-such-directory'), '--report-only'],
        fixture
      );
      expect(result.code).toBe(2);
    });

    it('measures another checkout when --root points at one', () => {
      // `--root` only re-based the RELATIVE paths in the report; the scan still
      // ran against the current working directory. So pointing it at another
      // checkout silently measured THIS tree -- the same false clean verdict, by
      // a different route. Relative roots must follow the flag.
      //
      // The cwd and --root are deliberately DIFFERENT trees: running with
      // `--root other` while cwd is `other` cannot distinguish the two, which is
      // exactly how the first version of this test passed against the bug.
      const other = mkdtempSync(join(tmpdir(), 'ccn-other-'));
      try {
        mkdirSync(join(other, 'src'), { recursive: true });
        writeFileSync(
          join(other, 'src', 'deep.ts'),
          [
            'export function deepFunction(a: number): number {',
            '  if (a > 1) return 1;',
            '  if (a > 2) return 2;',
            '  return 0;',
            '}',
            '',
          ].join('\n'),
          'utf8'
        );
        // `fixture` (the cwd) has no such function, so the name can only appear
        // if the scan followed --root.
        const result = run(['--threshold', '1', '--root', other], fixture);
        expect(result.stdout).toContain('deepFunction');
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });
  });

  describe('--csv-verified (what xp-gate Gate 3 pipes through)', () => {
    /** Feed a lizard-style CSV row through --csv-verified; return stdout+code. */
    function verify(csv: string): { stdout: string; stderr: string; code: number } {
      // spawnSync rather than execFileSync: the batch writes its explanatory
      // reports (disagreements, dropped rows, unresolved rows) to stderr and
      // still exits 0, so exception-based capture would never see them and every
      // one of those channels would be untestable while stdout stayed green.
      const result = spawnSync(
        process.execPath,
        [SCRIPT, '--csv-verified', 'batch', '--root', fixture],
        { cwd: fixture, encoding: 'utf8', input: csv }
      );
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1 };
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
      const { stdout, stderr, code } = verify(lizardRow('real', 1, 2));
      expect(code).toBe(0);
      expect(stdout.split(',')[1]).toBe('4');
      // The disagreement is reported too, not just corrected: the count is the
      // only signal that lizard and the AST disagree about this function, and a
      // silent correction would hide a measurement bug behind a plausible number.
      expect(stderr).toContain('lizard disagreed');
      expect(stderr).toContain('real@1 lizard=2 ast=4');
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

    it('keeps column alignment when lizard quotes fields that contain commas', () => {
      // The path must ACTUALLY contain a comma, or lizard would not quote it and
      // the parser's quoting rules would never run. A temp dir named `ccn-gate-*`
      // has no comma, so the fixture here uses a dedicated subdirectory -- without
      // that the row is unquoted, every column lands correctly under any parser,
      // and the test passes even against a deliberately broken one.
      const commaDir = join(fixture, 'dir,with,commas');
      mkdirSync(commaDir, { recursive: true });
      const sourcePath = join(commaDir, 'probe.ts');
      writeFileSync(
        sourcePath,
        [
          'export function quoted(a: number, b: number): number {',
          '  if (a && b) { return 1; }',
          '  return 0;',
          '}',
        ].join('\n'),
        'utf8'
      );
      // A signature with a comma is quoted too, so two columns exercise quoting.
      const columns = [
        '4', // NLOC
        '9', // CCN -- deliberately wrong, must be replaced by the AST value
        '40', // token_len
        '2', // param_count
        '20',
        `quoted@1-4@${sourcePath}`,
        sourcePath,
        'quoted',
        'function quoted(a, b)',
        '1',
        '4',
      ];
      const row = columns.map((field) => (field.includes(',') ? `"${field}"` : field)).join(',');
      // Sanity: the row really is quoted, so this test cannot silently degrade
      // into the unquoted case it is meant to distinguish itself from.
      expect(row).toContain('"');

      const { stdout, code } = verify(row);
      expect(code).toBe(0);
      // Split the ANSWER the same way a CSV reader would. Using `split(',')` here
      // would be the mirror image of the bug under test: the quoted path contains
      // commas, so a naive split reports 16 columns and a correct parser 11.
      const fields = splitCsv(stdout.trim());
      expect(fields).toHaveLength(columns.length);
      // CCN 3: one `if` plus `&&`. The assertion is about the column staying put.
      expect(fields[1]).toBe('3');
      // The round-trip preserves the path exactly -- re-quoting an already
      // quoted field would double the escapes and break the next reader.
      expect(fields[6]).toBe(sourcePath);
    });

    it('reads a doubled quote inside a quoted field as one literal quote', () => {
      // CSV escaping: a field containing `"` is written `""`. Getting this wrong
      // desynchronises the quote state, so every later comma is treated as being
      // inside quotes and the whole row collapses into a single field.
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        ['export function dq(): void {', '  if (true) { return; }', '}'].join('\n'),
        'utf8'
      );
      const path = join(fixture, 'src', 'probe.ts');
      const columns = [
        '3', // NLOC
        '7', // CCN -- deliberately wrong
        '9', // token_len
        '0', // param_count
        '5',
        `dq@1-3@${path}`,
        path,
        'dq',
        'function dq() /* says "hi" */',
        '1',
        '3',
      ];
      const row = columns
        .map((field) => (field.includes('"') ? `"${field.replace(/"/g, '""')}"` : field))
        .join(',');

      const { stdout, code } = verify(row);
      expect(code).toBe(0);
      // Both the column COUNT and the CCN matter here: a parser that treats `""`
      // as two separate quote toggles stays "in quotes" for the rest of the row,
      // so it silently merges the trailing columns instead of failing outright.
      // Asserting only column 1 would pass on that mutant.
      const fields = splitCsv(stdout.trim());
      expect(fields).toHaveLength(columns.length);
      expect(fields[1]).toBe('2');
      // The signature survives the round-trip with its literal quotes intact.
      expect(fields[8]).toBe('function dq() /* says "hi" */');
    });

    it('reads the older location layout, which keeps line and path in later columns', () => {
      // Newer lizard packs everything into column 5 as `fn@start-end@path`; the
      // older one leaves column 5 as a bare name and puts the path in column 6
      // and the line in column 9. Reading only the packed shape silently drops
      // every row from an older lizard, which reports "no function measured".
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        [
          'export function legacy(): number {',
          '  if (true) { return 1; }',
          '  return 0;',
          '}',
        ].join('\n'),
        'utf8'
      );
      const path = join(fixture, 'src', 'probe.ts');
      const columns = [
        '4', // NLOC
        '9', // CCN -- deliberately wrong
        '40', // token_len
        '0', // param_count
        '20',
        'legacy', // column 5: bare name, no packed location
        path, // column 6: the path
        'legacy',
        'function legacy()',
        '1', // column 9: the start line
        '4',
      ];

      const { stdout, code } = verify(columns.join(','));
      expect(code).toBe(0);
      const fields = splitCsv(stdout.trim());
      expect(fields).toHaveLength(columns.length);
      expect(fields[1]).toBe('2');
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

  /**
   * Which files the script *scans* decides which functions can ever have a
   * baseline entry, and Gate 3's ratchet verdict is "worse than recorded" — a
   * function with no record is not clean, it is ungraded and silently skipped.
   *
   * The default root list used to be `['src']` and the file filter was `.ts`,
   * while adapters/gate-3.sh selects `.ts/tsx/js/jsx` across the whole tree.
   * Every function in `scripts/*.mjs` was therefore in the gate's population
   * but could never be recorded: 250 of them, including `installCommand` at
   * cognitive 56. The gate reported PASS throughout.
   *
   * These tests pin the scan population, because the failure mode is a silent
   * pass rather than an error.
   */
  describe('scan population', () => {
    it('grades .mjs files, which Gate 3 selects but `.ts` alone skipped', () => {
      mkdirSync(join(fixture, 'scripts'), { recursive: true });
      writeFileSync(
        join(fixture, 'scripts', 'tool.mjs'),
        [
          'export function fromMjs(a) {',
          '  if (a) return 1;',
          '  if (!a) return 2;',
          '  return 3;',
          '}',
        ].join('\n'),
        'utf8'
      );
      const stdout = run(['--threshold', '1', '--report-only'], fixture).stdout;
      // Two `if`s make CCN 3, so it is only reported if the file was read at all.
      expect(ccnOf(stdout, 'fromMjs')).toBe(3);
    });

    it('scans scripts/ and prisma/ by default, not just src/', () => {
      for (const [dir, name] of [
        ['scripts', 'fromScripts'],
        ['prisma', 'fromPrisma'],
        ['src', 'fromSrc'],
      ] as const) {
        mkdirSync(join(fixture, dir), { recursive: true });
        writeFileSync(
          join(fixture, dir, `${name}.mjs`),
          [`export function ${name}(a) {`, '  return a ? 1 : 2;', '}'].join('\n'),
          'utf8'
        );
      }
      // No positional path: the default root list is what is under test.
      const stdout = run(['--threshold', '1', '--report-only'], fixture).stdout;
      expect(ccnOf(stdout, 'fromScripts')).toBe(2);
      expect(ccnOf(stdout, 'fromPrisma')).toBe(2);
      expect(ccnOf(stdout, 'fromSrc')).toBe(2);
    });

    it('still honours an explicit path over the default root list', () => {
      mkdirSync(join(fixture, 'scripts'), { recursive: true });
      writeFileSync(
        join(fixture, 'scripts', 'only.mjs'),
        ['export function excluded(a) {', '  return a ? 1 : 2;', '}'].join('\n'),
        'utf8'
      );
      writeFileSync(
        join(fixture, 'src', 'probe.ts'),
        ['export function included(a) {', '  return a ? 1 : 2;', '}'].join('\n'),
        'utf8'
      );
      const stdout = run(['--threshold', '1', '--report-only', 'src'], fixture).stdout;
      expect(ccnOf(stdout, 'included')).toBe(2);
      expect(ccnOf(stdout, 'excluded')).toBeNull();
    });

    it('classifies everything under tests/ as a test file, as Gate 3 does', () => {
      // Gate 3's exclusion regex contains `(^|/)(tests?)/`, so a helper living
      // under tests/ is never graded. `bucketFor` used to know only about
      // `__tests__` and `.test.`, which made helpers such as
      // tests/helpers/test-db.ts count as production debt and put them in the
      // baseline -- work spent on code the gate will never look at.
      const helpers = join(fixture, 'tests', 'helpers');
      mkdirSync(helpers, { recursive: true });
      writeFileSync(
        join(helpers, 'support.ts'),
        ['export function helper(a, b) {', '  return a && b ? 1 : 2;', '}'].join('\n'),
        'utf8'
      );

      const json = run(['--threshold', '1', '--json'], fixture).stdout;
      const parsed = JSON.parse(json) as {
        results: Array<{ name: string; bucket: string }>;
      };
      const row = parsed.results.find((r) => r.name === 'helper');
      expect(row, 'the helper should still be measured').toBeDefined();
      expect(row?.bucket).toBe('test');
    });

    it('still treats a src/ file under a tests-named directory as production', () => {
      // The new rule must not be a blunt "contains the word tests" match: a
      // path like src/latest/ is production, and excusing it would hide real
      // debt -- the failure mode this whole fix is about.
      const dir = join(fixture, 'src', 'latest');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'real.ts'),
        ['export function realWork(a, b) {', '  return a && b ? 1 : 2;', '}'].join('\n'),
        'utf8'
      );

      const json = run(['--threshold', '1', '--json'], fixture).stdout;
      const parsed = JSON.parse(json) as {
        results: Array<{ name: string; bucket: string }>;
      };
      const row = parsed.results.find((r) => r.name === 'realWork');
      expect(row?.bucket).toBe('production');
    });
  });
});
