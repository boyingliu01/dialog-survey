import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards for `scripts/cli.mjs`'s install pipeline.
 *
 * Why a source-level test instead of a behavioural one: the bug these guard
 * against is an identifier that is read but never bound. It sits on the SUCCESS
 * path of `install` -- after config resolution, directory preparation,
 * dependency installation and migrations have all completed -- so exercising it
 * behaviourally would mean driving the whole installer through a real
 * filesystem and process manager. Worse, the existing suite stayed green
 * throughout: `installCommand` is not exported, so nothing ever ran that line.
 *
 * A narrow static check is the honest control here. It is deliberately scoped
 * to the one failure mode (a bare `credentials` reference outside the scope that
 * binds it), not a general linter -- Biome and tsc already cover those, and a
 * home-grown quasi-linter would be a maintenance liability.
 */

const CLI = join(import.meta.dirname, '..', 'scripts', 'cli.mjs');

function cliSource(): string {
  return readFileSync(CLI, 'utf8');
}

/**
 * Extract a top-level function body by brace matching from its declaration.
 *
 * Returns the text between the opening and closing brace, or null when the
 * declaration is not found. Brace matching is enough here because the file is
 * plain ESM with no regex literals containing unbalanced braces in the regions
 * this inspects.
 */
function functionBody(source: string, name: string): string | null {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = expressionStart(source, pattern);
  if (match === -1) return null;

  const open = source.indexOf('{', match);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

function expressionStart(source: string, pattern: RegExp): number {
  return source.search(pattern);
}

describe('scripts/cli.mjs install pipeline', () => {
  it('never reads `credentials` outside a scope that binds it', () => {
    // The original bug: `installCommand` called `startAndReport(credentials, …)`
    // while `credentials` was declared inside `checkEnvironment` and never
    // returned. TypeScript does not check .mjs, so the only signal would have
    // been a ReferenceError on a real successful install -- after npm install,
    // Playwright and migrations had already run.
    const body = functionBody(cliSource(), 'installCommand');
    expect(body, 'installCommand should exist').not.toBeNull();

    const reads = (body ?? '').match(/\bcredentials\b/g) ?? [];
    const binds = (body ?? '').match(
      /\b(const|let|var)\s+\{[^}]*\bcredentials\b[^}]*\}|function\s+\w+\s*\([^)]*\bcredentials\b/
    );
    expect(
      reads.length === 0 || Boolean(binds),
      `installCommand reads \`credentials\` ${reads.length} time(s) but never binds it`
    ).toBe(true);
  });

  it('hands the credentials back out of checkEnvironment', () => {
    // The fix has to be at the producer: returning only `config` is what made
    // the consumer unbound. Assert the shape, not the wording.
    const body = functionBody(cliSource(), 'checkEnvironment');
    expect(body, 'checkEnvironment should exist').not.toBeNull();
    expect(body).toMatch(/return\s*\{\s*config\s*,\s*credentials\s*\}/);
  });

  it('parses as valid ESM', () => {
    // A brace-matching helper is only trustworthy if the file it reads is
    // syntactically sound; check that before relying on the assertions above.
    const result = spawnSync(process.execPath, ['--check', CLI], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
