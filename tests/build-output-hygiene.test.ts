import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-195-HYGIENE
 * @intent The published npm tarball shipped ~590 compiled test files under dist/tests
 *         because tsconfig.json includes tests/** (needed so `tsc --noEmit` type-checks
 *         the suite) AND npm run build emitted the same config. `files: ["dist/"]` then
 *         packed every one of them. The runtime entry is dist/src/server-entry.js, so the
 *         emitted build must contain src/ only.
 *
 *         Note: an `.npmignore` exclusion of `dist/tests/` does NOT work — a directory
 *         listed in the `files` allowlist overrides .npmignore for its contents (verified
 *         empirically). The only correct fix is to not emit them.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath: string): string => readFileSync(join(repoRoot, relativePath), 'utf8');

interface TsConfig {
  extends?: string;
  include?: string[];
  exclude?: string[];
  compilerOptions?: { outDir?: string; rootDir?: string; noEmit?: boolean };
}

describe('build output hygiene (npm tarball ships no compiled tests)', () => {
  it('has a dedicated build tsconfig that emits src/ only', () => {
    expect(existsSync(join(repoRoot, 'tsconfig.build.json'))).toBe(true);

    const buildConfig = JSON.parse(read('tsconfig.build.json')) as TsConfig;

    // It must inherit the real compiler options rather than restate them, so the
    // two configs cannot drift (strictness, outDir, declaration, exactOptional...).
    expect(buildConfig.extends).toBe('./tsconfig.json');
    expect(buildConfig.include).toEqual(['src/**/*']);

    // The emitted output must still live at dist/ (every runtime path — ecosystem
    // config, installer verification, `npm start` — hardcodes dist/src/server-entry.js).
    expect(buildConfig.compilerOptions?.outDir).toBeUndefined();
  });

  it('keeps tsconfig.json type-checking the test suite', () => {
    // The build split must not come at the cost of test type-safety: `npm run
    // type-check` runs `tsc --noEmit` on tsconfig.json, which must still cover tests.
    const baseConfig = JSON.parse(read('tsconfig.json')) as TsConfig;
    expect(baseConfig.include).toEqual(expect.arrayContaining(['src/**/*', 'tests/**/*']));
  });

  it('points the build script at the build tsconfig', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['build']).toBe('tsc -p tsconfig.build.json');
  });

  it('emits dist/src but never dist/tests', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ds-build-hygiene-'));
    try {
      // A real build into a scratch outDir: proves the emitted tree, not just config text.
      execFileSync(
        process.execPath,
        [
          join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
          '-p',
          join(repoRoot, 'tsconfig.build.json'),
          '--outDir',
          outDir,
        ],
        { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const emitted = readdirSync(outDir);
      expect(emitted).toContain('src');
      expect(emitted).not.toContain('tests');

      // The entry point the installer spawns must exist in the emitted tree.
      expect(existsSync(join(outDir, 'src', 'server-entry.js'))).toBe(true);

      const walk = (dir: string, prefix = ''): string[] => {
        const out: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
          if (entry.isDirectory()) {
            out.push(...walk(join(dir, entry.name), relative));
          } else {
            out.push(relative);
          }
        }
        return out;
      };
      expect(walk(outDir).filter((file) => file.endsWith('.test.js'))).toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 240_000);
});
