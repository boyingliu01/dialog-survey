import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { info, warn } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import { buildQuestionMap as buildQuestionMapShared } from '../utils/template-content.js';

/**
 * PDF and Excel export are low-frequency admin actions, but `playwright` and
 * `xlsx` together cost ~97 MB of RSS the moment they are *imported* — measured
 * as 56 MB -> 153 MB on a bare Node process. That is paid at boot by every
 * deployment that never exports anything. Issue #210: load them on first use.
 *
 * They stay at module scope (not per call) so repeat exports do not re-pay the
 * load cost, and so tests can still `vi.mock('playwright')`.
 */
type PlaywrightModule = typeof import('playwright');
type XlsxModule = typeof import('xlsx');

let playwrightModule: PlaywrightModule | undefined;
let xlsxModule: XlsxModule | undefined;

async function loadPlaywright(): Promise<PlaywrightModule> {
  if (!playwrightModule) {
    playwrightModule = await import('playwright');
  }
  return playwrightModule;
}

async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxModule) {
    const loaded = await import('xlsx');
    // `xlsx` is CommonJS: under Node ESM its exports land on `.default`, and
    // the named bindings are only a compatibility mirror. Prefer `default`
    // when present so both the CJS and the ESM-interop shapes work.
    xlsxModule = (loaded as { default?: XlsxModule }).default ?? loaded;
  }
  return xlsxModule;
}

/** Test seam: drop the memoised modules so a suite can assert lazy loading. */
export function resetExportModuleCacheForTests(): void {
  playwrightModule = undefined;
  xlsxModule = undefined;
}

/**
 * Report a missing CJK font once per process. PDF export degrades to a font
 * name the runtime may not have, and doing so on every export would either
 * flood the logs or (as before) stay invisible. One line is enough to tell an
 * operator the image is missing the bundled font.
 */
let cjkFontWarned = false;
function warnMissingCjkFont(fontPath: string): void {
  if (cjkFontWarned) return;
  cjkFontWarned = true;
  warn('CJK font missing — exported PDFs will not render Chinese correctly', { fontPath });
}

/** Test seam: allow a suite to observe the one-shot warning more than once. */
export function resetCjkFontWarningForTests(): void {
  cjkFontWarned = false;
}

/** True for a non-null object, which is all the invitee entry needs to be. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Pull the invitee's own name and phone out of a plan's `inviteeData` blob.
 *
 * The blob is JSON authored elsewhere, so every read is guarded: `Array.isArray`
 * for the container, `isRecord` per entry, and a `typeof` check per field. Kept
 * flat (find-then-read rather than loop-and-nest) because the four levels of
 * guard were the bulk of its cognitive complexity, not its logic.
 */
function loadInviteeInfo(inviteeData: unknown, userId: string): { name?: string; phone?: string } {
  if (!Array.isArray(inviteeData)) return {};

  const match = inviteeData.find((entry) => isRecord(entry) && entry['userId'] === userId);
  if (!isRecord(match)) return {};

  const result: { name?: string; phone?: string } = {};
  const name = match['name'];
  const phone = match['phone'];
  if (typeof name === 'string') result.name = name;
  if (typeof phone === 'string') result.phone = phone;
  return result;
}

/**
 * Columns both exporters need. Each exporter then adds only the relation it
 * actually renders (messages for PDF, template content for Excel) — the shared
 * column list lives here so the two stay in sync.
 */
const EXPORT_INTERVIEW_SELECT = {
  id: true,
  userId: true,
  status: true,
  templateId: true,
  responses: {
    select: { questionId: true, content: true, isFollowup: true, followupDepth: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

export class ExportService {
  private readonly reportsDir: string;

  /**
   * Where the bundled CJK font lives.
   *
   * Deliberately *not* `reportsDir`. That directory collects generated PDFs and
   * spreadsheets, is gitignored wholesale, and gets deleted by cleanup scripts
   * and mutation runs; the font is a tracked code asset that never changes. While
   * the two shared a directory, `rm -rf reports` silently took the font with it,
   * and Stryker's `ignorePatterns: ["/reports"]` existed only to work around the
   * mix. Keeping them apart makes both directories honest: everything under
   * `reports/` is disposable, everything under `assets/` is not.
   */
  private readonly assetsDir: string;

  constructor(
    private prisma: PrismaClient,
    reportsDir?: string,
    assetsDir?: string
  ) {
    this.reportsDir = reportsDir ?? process.env['REPORTS_DIR'] ?? './reports';
    this.assetsDir = assetsDir ?? process.env['ASSETS_DIR'] ?? './assets/fonts';
    mkdirSync(this.reportsDir, { recursive: true });
  }

  private findLatestReport(interviewId: string) {
    return this.prisma.analysisReport.findFirst({
      where: { interviewId },
      orderBy: { createdAt: 'desc' },
      select: { content: true, keyFindings: true, sentiment: true, recommendations: true },
    });
  }

  async exportInterviewToPdf(interviewId: string): Promise<string> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        ...EXPORT_INTERVIEW_SELECT,
        planId: true,
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    const report = await this.findLatestReport(interviewId);

    let inviteeInfo: { name?: string; phone?: string } = {};
    if (interview.planId) {
      const plan = await this.prisma.interviewPlan.findUnique({
        where: { id: interview.planId },
        select: { inviteeData: true },
      });
      inviteeInfo = loadInviteeInfo(plan?.inviteeData, interview.userId);
    }

    const html = this.renderPdfHtml(interview, report, inviteeInfo);
    const executablePath = process.env['PLAYWRIGHT_EXECUTABLE_PATH'] || undefined;
    let launchOpts: Record<string, unknown> = {};
    if (executablePath) {
      launchOpts = { executablePath };
    }
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch(launchOpts);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdfPath = join(this.reportsDir, `interview-${interviewId}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      info('PDF exported', { interviewId, path: pdfPath });
      return pdfPath;
    } finally {
      await browser.close();
    }
  }

  async exportInterviewToExcel(interviewId: string): Promise<string> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        ...EXPORT_INTERVIEW_SELECT,
        template: { select: { content: true } },
      },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    const report = await this.findLatestReport(interviewId);

    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();

    // Map question IDs to question text from template content
    const questionMap = this.buildQuestionMap(interview.template?.content);

    // Sheet 1: Responses
    const rows = interview.responses.map((r) => ({
      question: questionMap[r.questionId] || r.questionId,
      answer: r.content,
      isFollowup: r.isFollowup ? '是' : '否',
      followupDepth: r.followupDepth,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '访谈回答');

    // Sheet 2: Report summary (if exists)
    if (report) {
      const summaryRows: Record<string, string>[] = [];
      summaryRows.push({ 字段: '情感分析', 值: report.sentiment ?? '' });
      for (const f of report.keyFindings ?? []) {
        summaryRows.push({ 字段: '关键发现', 值: f });
      }
      for (const r of report.recommendations ?? []) {
        summaryRows.push({ 字段: '建议', 值: r });
      }
      const ws2 = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, ws2, '报告摘要');
    }

    const xlsxPath = join(this.reportsDir, `interview-${interviewId}.xlsx`);
    XLSX.writeFile(wb, xlsxPath);
    info('Excel exported', { interviewId, path: xlsxPath });
    return xlsxPath;
  }

  /**
   * Build the `@font-face` CSS for the bundled CJK font.
   *
   * The font is embedded as base64 so the PDF renderer needs no system fonts.
   * When it is missing or unreadable, fall back to font names and warn once per
   * process: the fallback names are absent from minimal images (e.g.
   * node:alpine), so Chinese would render as boxes — a failure that used to be
   * completely silent.
   */
  private loadCjkFontCss(): string {
    const fontPath = join(this.assetsDir, 'NotoSansCJKsc-Regular.otf');
    if (existsSync(fontPath)) {
      try {
        const fontBase64 = readFileSync(fontPath).toString('base64');
        return `@font-face{font-family:'NotoSansCJK';src:url(data:font/opentype;base64,${fontBase64})}body{font-family:'NotoSansCJK',sans-serif}`;
      } catch {
        warn('Failed to read CJK font for PDF', { fontPath });
      }
    }
    // A deployment that still carries the font in the old location (before it
    // moved out of the output directory) keeps working, but says so once, so the
    // stale copy can be removed deliberately rather than rediscovered later.
    const legacyPath = join(this.reportsDir, 'NotoSansCJKsc-Regular.otf');
    if (existsSync(legacyPath)) {
      warn('CJK font found in the legacy reports/ location — it now belongs in assets/fonts', {
        legacyPath,
        expected: fontPath,
      });
      try {
        const fontBase64 = readFileSync(legacyPath).toString('base64');
        return `@font-face{font-family:'NotoSansCJK';src:url(data:font/opentype;base64,${fontBase64})}body{font-family:'NotoSansCJK',sans-serif}`;
      } catch {
        warn('Failed to read CJK font for PDF', { fontPath: legacyPath });
      }
    }
    warnMissingCjkFont(fontPath);
    return 'body{font-family:"Noto Sans CJK SC","Noto Sans SC","Noto Sans",sans-serif}';
  }

  /** The optional analysis section of the PDF, or an empty string when absent. */
  private renderReportSection(
    report: {
      content: string;
      keyFindings: string[];
      sentiment: string | null;
      recommendations: string[];
    } | null
  ): string {
    if (!report) return '';
    const findings = report.keyFindings?.length
      ? `<h4 style="margin-top:12px;color:#555">关键发现</h4><ul>${report.keyFindings.map((f) => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>`
      : '';
    const sentiment = report.sentiment
      ? `<p style="margin-top:8px;color:#555">情感分析: <strong>${this.escapeHtml(this.translateSentiment(report.sentiment))}</strong></p>`
      : '';
    const recommendations = report.recommendations?.length
      ? `<h4 style="margin-top:12px;color:#555">建议</h4><ul>${report.recommendations.map((r) => `<li>${this.escapeHtml(r)}</li>`).join('')}</ul>`
      : '';
    return `<h2 style="margin-top:24px;color:#333">访谈分析总结</h2>
         <div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;padding:12px;margin-top:8px">
           <p style="color:#555;line-height:1.6">${this.escapeHtml(report.content).replace(/\n/g, '<br>')}</p>
           ${findings}
           ${sentiment}
           ${recommendations}
         </div>`;
  }

  private renderPdfHtml(
    interview: {
      userId: string;
      status: string;
      messages: Array<{ role: string; content: string }>;
      responses: Array<{
        questionId: string;
        content: string;
        isFollowup: boolean;
        followupDepth: number;
      }>;
    },
    report: {
      content: string;
      keyFindings: string[];
      sentiment: string | null;
      recommendations: string[];
    } | null,
    inviteeInfo: { name?: string; phone?: string }
  ): string {
    const fontFaceCss = this.loadCjkFontCss();

    const displayName = inviteeInfo.name || interview.userId;
    const headerParts = [`用户: ${this.escapeHtml(interview.userId)}`];
    if (inviteeInfo.name) {
      headerParts.push(`姓名: ${this.escapeHtml(inviteeInfo.name)}`);
    }
    if (inviteeInfo.phone) {
      headerParts.push(`电话: ${this.escapeHtml(inviteeInfo.phone)}`);
    }
    headerParts.push(`状态: ${this.escapeHtml(interview.status)}`);

    const dialogRows = interview.messages
      .map((m) => {
        const isBot = m.role === 'assistant';
        const roleLabel = isBot ? '🤖 机器人' : '👤 受访者';
        const bgColor = isBot ? '#f0f7ff' : '#fff';
        return `<tr>
          <td style="border:1px solid #ccc;padding:6px;vertical-align:top;width:80px;background:${bgColor}"><strong>${roleLabel}</strong></td>
          <td style="border:1px solid #ccc;padding:6px;background:${bgColor}">${this.escapeHtml(m.content).replace(/\n/g, '<br>')}</td>
        </tr>`;
      })
      .join('\n');

    const reportHtml = this.renderReportSection(report);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>访谈报告 - ${this.escapeHtml(displayName)}</title>
<style>
  ${fontFaceCss}
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin-top: 16px; margin-bottom: 8px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f5f5f5; border: 1px solid #ccc; padding: 6px; text-align: left; font-weight: 600; }
</style></head>
<body>
  <h1>访谈报告</h1>
  <p style="color:#666">${headerParts.join(' | ')}</p>

  <h2>访谈对话记录</h2>
  <table>
    <thead><tr>
      <th style="border:1px solid #ccc;padding:6px;text-align:center;width:80px">角色</th>
      <th style="border:1px solid #ccc;padding:6px">内容</th>
    </tr></thead>
    <tbody>${dialogRows}</tbody>
  </table>

  ${reportHtml}
</body>
</html>`;
  }

  private translateSentiment(sentiment: string): string {
    const map: Record<string, string> = {
      positive: '积极',
      negative: '消极',
      neutral: '中性',
    };
    return map[sentiment] ?? sentiment;
  }

  private buildQuestionMap(contentJson: string | null | undefined): Record<string, string> {
    return buildQuestionMapShared(contentJson);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
