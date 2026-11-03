import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test Gate 6 scope
 * @intent `.archlint.yaml` controls what archlint (xp-gate Gate 6) reports. Its
 *   `ignore` key REPLACES the built-in default list rather than extending it —
 *   a fact that is not obvious from the file and is expensive to rediscover.
 *   Measured on 2026-11-03 (archlint 0.16.0, v1.13.2):
 *
 *     no config file ................ 142 smells, grade 5.4/10 (Moderate)
 *     config missing the default list 194 smells, grade 4.2/10 — 138 of them
 *                                     with a tests/ primary file (72 CodeClone
 *                                     + 41 DeadSymbol from test doubles like
 *                                     FakeWebSocket.send, which only ever have
 *                                     indirect callers)
 *     config as committed here ....... 72 smells, grade 7.1/10 (Fair)
 *
 *   So the "improvement" of adding an ignore file can make the report worse if
 *   the default entries are not carried over. These assertions make that
 *   impossible to do silently.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const configPath = join(repoRoot, '.archlint.yaml');
const config = readFileSync(configPath, 'utf8');

/** Entries under the top-level `ignore:` key, quote-stripped. */
function ignoreEntries(): string[] {
  const lines = config.split('\n');
  const start = lines.findIndex((line) => /^ignore:\s*$/.test(line));
  if (start === -1) return [];
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top-level key
    const match = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
    if (match) entries.push(match[1]);
  }
  return entries;
}

const entries = ignoreEntries();

describe('.archlint.yaml ignore list', () => {
  it('exists and declares ignore entries', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('keeps the archlint default ignore list, because `ignore` replaces it', () => {
    // The defaults `archlint init` writes. Dropping `**/tests/**` alone brings
    // 138 findings back, the majority of them false-positive DeadSymbol reports
    // against test doubles.
    const defaults = [
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.spec.js',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/test/**',
      '**/tests/**',
      '**/__fixtures__/**',
      '**/*.mock.ts',
      '**/*.mock.js',
    ];
    const missing = defaults.filter((d) => !entries.includes(d));
    expect(missing).toEqual([]);
  });

  it('ignores the vendored minified bundles', () => {
    // 51 of the pre-config findings came from htmx.min.js / alpine.min.js.
    // A minified bundle is supposed to be deeply nested and complex; reporting
    // it teaches people to skim past the real findings.
    expect(entries).toContain('**/*.min.js');
    expect(entries).toContain('public/js/**');
  });

  it('ignores archived sprint artefacts and agent scratch directories', () => {
    // These are historical evidence and one-off probes, not maintained source.
    expect(entries).toContain('.sprint-history/**');
    expect(entries).toContain('docs/sprints/**');
    expect(entries).toContain('.git/**');
    expect(entries).toContain('tools/spike/**');
  });

  it('does not ignore src/, so the product code stays fully in scope', () => {
    // The point of Gate 6 is finding smells in shippable code. An ignore entry
    // covering src/ would make the gate vacuous.
    const srcIgnored = entries.filter(
      (e) => e === 'src' || e === 'src/**' || e === '**/src/**' || e.startsWith('src/')
    );
    expect(srcIgnored).toEqual([]);
  });

  it('has no duplicate entries', () => {
    expect(entries.length).toBe(new Set(entries).size);
  });
});
