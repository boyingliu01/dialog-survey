import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * @test REQ-207-01
 * @intent 验证 CJK 字体从独立资产目录读取，reports/ 保持纯输出目录，且旧位置仍可兼容
 * @covers 字体优先取 assetsDir、assetsDir 缺失时回退 reportsDir 并警告、都缺失时给出一次性缺失警告
 *
 * `reports/` used to hold both generated PDFs and a tracked 15.68 MB font. That
 * mix made `rm -rf reports` delete a code asset, forced a `.gitignore` whitelist
 * exception, and pushed Stryker's `ignorePatterns` toward a bare `reports` entry
 * that excluded `src/views/reports/` and broke every mutant dry run. These tests
 * pin the separation so the two cannot quietly merge again.
 */

const mockWarn = vi.fn();
vi.mock('../src/utils/logger.js', () => ({
  warn: (...args: unknown[]) => mockWarn(...args),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const { ExportService, resetCjkFontWarningForTests } = await import(
  '../src/services/export.service.js'
);

const mockPrisma = {
  interview: { findUnique: vi.fn() },
  analysisReport: { findFirst: vi.fn() },
  interviewPlan: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const FONT = 'NotoSansCJKsc-Regular.otf';

describe('CJK font location', () => {
  let root: string;
  let reportsDir: string;
  let assetsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCjkFontWarningForTests();
    root = mkdtempSync(join(tmpdir(), 'export-font-'));
    reportsDir = join(root, 'reports');
    assetsDir = join(root, 'assets', 'fonts');
    mkdirSync(reportsDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * `loadCjkFontCss` is private, so the observable is the warning the export path
   * emits when no font is readable. Calling the public entry point with an
   * interview that has no report exercises exactly that branch.
   */
  async function runExport(): Promise<void> {
    vi.mocked(mockPrisma.interview.findUnique).mockResolvedValue({
      id: 'iv-1',
      userId: 'user-001',
      status: 'COMPLETED',
      templateId: 'tpl-1',
      planId: 'plan-1',
      messages: [],
      responses: [],
    } as never);
    vi.mocked(mockPrisma.interviewPlan.findUnique).mockResolvedValue({
      inviteeData: [],
    } as never);
    vi.mocked(mockPrisma.analysisReport.findFirst).mockResolvedValue(null);
    const service = new ExportService(mockPrisma, reportsDir, assetsDir);
    await service.exportInterviewToPdf('iv-1');
  }

  it('reports the font as missing from the assets directory, not reports/', async () => {
    await runExport();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('CJK font missing'),
      expect.objectContaining({ fontPath: join(assetsDir, FONT) })
    );
  });

  it('does not look for the font in the output directory when assets are present', async () => {
    writeFileSync(join(assetsDir, FONT), Buffer.from('font-bytes'));
    writeFileSync(join(reportsDir, FONT), Buffer.from('stale-copy'));

    await runExport();

    expect(mockWarn).not.toHaveBeenCalledWith(expect.stringContaining('legacy'), expect.anything());
    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('CJK font missing'),
      expect.anything()
    );
  });

  /**
   * A deployment that still has the font in the old location keeps rendering
   * Chinese, but says so once so the stale copy can be removed on purpose.
   */
  it('falls back to the legacy location and says so', async () => {
    writeFileSync(join(reportsDir, FONT), Buffer.from('legacy-font'));

    await runExport();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('legacy reports/ location'),
      expect.objectContaining({
        legacyPath: join(reportsDir, FONT),
        expected: join(assetsDir, FONT),
      })
    );
    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('CJK font missing'),
      expect.anything()
    );
  });

  /**
   * The separation is what keeps `reports/` deletable, so it is asserted against
   * the real layout — but only when this suite runs in the real checkout. Under
   * Stryker the tests execute inside a sandbox that deliberately excludes the
   * bundled font (a 15 MB copy per worker), so it is absent there by design and
   * the assertion would fail for the wrong reason.
   */
  it('keeps reports/ free of the tracked font in the repository layout', () => {
    const cwd = process.cwd();
    if (cwd.includes('.stryker-tmp') || cwd.includes('sandbox-')) return;

    expect(existsSync(join(cwd, 'assets', 'fonts', FONT))).toBe(true);
    expect(existsSync(join(cwd, 'reports', FONT))).toBe(false);
  });

  /**
   * The default matters more than any fixture: a deployment that sets neither
   * ASSETS_DIR nor REPORTS_DIR must still resolve the bundled font, and must not
   * fall back to the disposable output directory.
   */
  it('defaults to assets/fonts rather than the reports directory', () => {
    const previousAssets = process.env['ASSETS_DIR'];
    const previousReports = process.env['REPORTS_DIR'];
    delete process.env['ASSETS_DIR'];
    delete process.env['REPORTS_DIR'];

    try {
      const service = new ExportService(mockPrisma, reportsDir);
      const dirs = service as unknown as { assetsDir: string; reportsDir: string };

      expect(dirs.assetsDir).not.toBe(dirs.reportsDir);
      expect(dirs.assetsDir.replace(/\\/g, '/')).toContain('assets/fonts');
    } finally {
      if (previousAssets === undefined) delete process.env['ASSETS_DIR'];
      else process.env['ASSETS_DIR'] = previousAssets;

      if (previousReports === undefined) delete process.env['REPORTS_DIR'];
      else process.env['REPORTS_DIR'] = previousReports;
    }
  });
});
