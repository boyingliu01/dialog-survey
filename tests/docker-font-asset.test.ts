import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-207-02
 * @intent 验证 Docker 镜像确实打包 assets/fonts 里的 CJK 字体，且 reports/ 被当作纯输出目录排除
 * @covers Dockerfile 的 COPY assets、.dockerignore 的 reports/ 规则、export.service 的 ASSETS_DIR 默认值
 *
 * `export-font-location.test.ts` proves the font is read from `assets/fonts` and
 * not from `reports/`, but that is only half of #207: the image is built from
 * `.dockerignore`, so a rule that drops `assets/` (or a Dockerfile that forgets
 * to copy it) ships an image whose PDFs render Chinese as blank boxes. Alpine has
 * no CJK font, and `ExportService` only warns — it does not fail — so nothing in
 * the running product catches this. The regression gate has to live here.
 */

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function lines(file: string): string[] {
  return read(file)
    .split(/\r?\n/)
    .map((line) => line.trim());
}

/** Dockerfile stages (excluding comments) matter: only the runner's COPYs ship. */
function runnerInstructions(): string[] {
  const all = lines('Dockerfile');
  const start = all.findIndex((line) => /^FROM\s/.test(line) && /runner/i.test(line));
  return start === -1 ? [] : all.slice(start);
}

describe('Docker image ships the CJK font (issue #207)', () => {
  it('copies assets/ into the runner image', () => {
    const copies = runnerInstructions().filter(
      (line) => /^COPY\s/.test(line) && /\s\/app\/assets\s+\.\/assets$/.test(line)
    );

    expect(copies).toHaveLength(1);
  });

  it('does not exclude assets/ in .dockerignore', () => {
    const rules = lines('.dockerignore').filter((line) => line !== '' && !line.startsWith('#'));

    // `assets`, `assets/` or `**/assets` would drop the font from the build
    // context, leaving the COPY above with nothing to copy.
    const excludesAssets = rules.some((rule) => /^(\*\*\/)?assets\/?\*?$/.test(rule));
    expect(excludesAssets).toBe(false);
    // No negation rule is needed either: an `!` exception for the font is what
    // the old `reports/` layout required, and its return would mean the two
    // roles have merged again.
    expect(rules.some((rule) => rule.startsWith('!') && /assets|font/i.test(rule))).toBe(false);
  });

  it('treats reports/ as a pure output directory', () => {
    const rules = lines('.dockerignore').filter((line) => line !== '' && !line.startsWith('#'));

    expect(rules).toContain('reports/');
  });

  it('keeps the font path the export service actually reads', () => {
    // Guard the contract the Dockerfile depends on: if the filename or the
    // default directory changes, the image silently loses the font again.
    const source = read('src/services/export.service.ts');

    expect(source).toContain("process.env['ASSETS_DIR'] ?? './assets/fonts'");
    expect(source).toContain('NotoSansCJKsc-Regular.otf');
  });

  it('documents where the runtime looks for the font', () => {
    const runtimeDirs = lines('Dockerfile').filter((line) => /chown|mkdir/.test(line));

    // The non-root runtime user must be able to read the font and write reports.
    expect(runtimeDirs.join('\n')).toContain('/app/assets');
    expect(runtimeDirs.join('\n')).toContain('/app/reports');
  });
});
