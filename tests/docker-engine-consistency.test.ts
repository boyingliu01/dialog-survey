import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The container, the manifest and the dependency tree must agree on one Node
 * major (issue #213).
 *
 * Three declarations contradicted each other: `Dockerfile` pinned node:20-slim,
 * `package.json` allowed >=20.19, and the pruned *runtime* tree contained
 * `cookie@2.0.1` (via `@fastify/cookie` 11.1.1) declaring `engines.node: >=22`.
 * `npm ci` printed EBADENGINE on every build and the session cookie code ran on
 * a runtime it declares unsupported — invisible, because the build still
 * succeeded. The fix aligned everything on 22; this test is what keeps them
 * aligned, because each of the three can drift on its own.

 * Parsing is deliberately literal (no semver dependency): the goal is to catch
 * a hand-edit of one declaration, not to implement range resolution.
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

/** Every `FROM node:<tag>` in the Dockerfile, in file order. */
function dockerBaseTags(): string[] {
  return read('Dockerfile')
    .split(/\r?\n/)
    .filter((line) => /^\s*FROM\s+node:/i.test(line))
    .map((line) => /^\s*FROM\s+node:(\S+)/i.exec(line)?.[1] ?? '');
}

/**
 * True when `range` cannot be satisfied by the given majority.
 *
 * Handles the two shapes that occur here: a plain lower bound (`>=22.0.0`) and
 * a disjunction of alternatives (`>=23.5.0 || ^22.13.0 || ^20.17.0`, which
 * @inquirer publishes — still perfectly usable on 22). `*` and `x` place no
 * bound and never conflict.
 */
function excludesMajor(range: string, major: number): boolean {
  const clauses = range
    .split('||')
    .map((clause) => clause.trim())
    .filter((clause) => clause !== '');
  if (clauses.length === 0) return false;

  return clauses.every((clause) => {
    const numbers = clause.match(/\d+/g)?.map(Number) ?? [];
    if (numbers.length === 0) return false; // `*`, `x`, `latest`
    if (clause.startsWith('^') || clause.startsWith('~')) return numbers[0] !== major;
    if (clause.startsWith('>=')) return numbers[0] > major;
    if (clause.startsWith('<')) return numbers[0] <= major;
    return numbers[0] !== major; // a bare version is an exact pin
  });
}

/** Major version of a base-image tag such as `22-slim` or `22.1-bookworm-slim`. */
function tagMajor(tag: string): number {
  const match = /^(\d+)/.exec(tag);
  if (!match) throw new Error(`unparseable Docker tag: ${tag}`);
  return Number(match[1]);
}

const pkg = JSON.parse(read('package.json')) as { engines: Record<string, string> };
const lock = JSON.parse(read('package-lock.json')) as {
  packages: Record<string, { engines?: Record<string, string> }>;
};

describe('Dockerfile / engines / dependency tree agree on Node (issue #213)', () => {
  it('has a FROM line for a node image (the check would pass vacuously otherwise)', () => {
    expect(dockerBaseTags().length).toBeGreaterThanOrEqual(2);
  });

  it('uses the same node major in both stages', () => {
    const majors = [...new Set(dockerBaseTags().map(tagMajor))];

    expect(majors).toHaveLength(1);
  });

  it('uses node:22, matching package.json engines', () => {
    const imageMajor = tagMajor(dockerBaseTags()[0] ?? '');

    expect(imageMajor).toBe(22);
    // The manifest must admit the image's runtime: `>=20` would let CI run on a
    // node the image never uses, and `>=24` would declare the image invalid.
    expect(excludesMajor(pkg.engines['node'], imageMajor)).toBe(false);
  });

  it('matches .nvmrc, which the CI jobs pin their runner to', () => {
    const nvmrc = read('.nvmrc').trim();

    expect(tagMajor(nvmrc)).toBe(tagMajor(dockerBaseTags()[0] ?? ''));
  });

  it('keeps no runtime dependency declaring a higher node major than the image', () => {
    const imageMajor = tagMajor(dockerBaseTags()[0] ?? '');
    const offenders = Object.entries(lock.packages)
      .filter(([path]) => path !== '')
      .filter(([, entry]) => {
        const range = entry.engines?.['node'];
        return range !== undefined && excludesMajor(range, imageMajor);
      })
      .map(([path, entry]) => `${path} requires node${entry.engines?.['node']}`);

    // This is the assertion that would have failed on `cookie@2.0.1`
    // (`node_modules/@fastify/cookie/node_modules/cookie`), the package the
    // issue was filed about.
    expect(offenders).toEqual([]);
  });

  it('keeps no runtime dependency of the overridden cookie plugin requiring node>=22', () => {
    // The override pins @fastify/cookie to 11.1.0, whose only cookie dependency
    // is cookie@1 (>=18). If the override is dropped, a cookie@2 entry
    // reappears in the lock and the previous test catches it — this one names
    // the failure the way the issue described it.
    const cookieMajors = Object.entries(lock.packages)
      .filter(([path]) => /(^|\/)cookie$/.test(path))
      .map(([path, entry]) => ({ path, version: (entry as { version?: string }).version ?? '' }));

    expect(cookieMajors.length).toBeGreaterThan(0);
    expect(cookieMajors.filter((entry) => entry.version.startsWith('2.'))).toEqual([]);
  });
});
