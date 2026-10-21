import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { info, warn } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import { buildQuestionMap as buildQuestionMapShared } from '../utils/template-content.js';

/**
 * Report a missing CJK font once per process. PDF export degrades to a font
 * name the runtime may not have, and doing so on every export would either
 * flood the logs or (as before) stay invisible. One line is enough to tell an
 * operator the image is missing reports/NotoSansCJKsc-Regular.otf.
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

function loadInviteeInfo(inviteeData: unknown, userId: string): { name?: string; phone?: string } {
  if (!Array.isArray(inviteeData)) return {};
  for (const entry of inviteeData) {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      if (obj['userId'] === userId) {
        const result: { name?: string; phone?: string } = {};
        if (typeof obj['name'] === 'string') result.name = obj['name'];
        if (typeof obj['phone'] === 'string') result.phone = obj['phone'];
        return result;
      }
    }
  }
  return {};
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

  constructor(
    private prisma: PrismaClient,
    reportsDir?: string
  ) {
    this.reportsDir = reportsDir ?? process.env['REPORTS_DIR'] ?? './reports';
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
    const fontPath = join(this.reportsDir, 'NotoSansCJKsc-Regular.otf');
    if (existsSync(fontPath)) {
      try {
        const fontBase64 = readFileSync(fontPath).toString('base64');
        return `@font-face{font-family:'NotoSansCJK';src:url(data:font/opentype;base64,${fontBase64})}body{font-family:'NotoSansCJK',sans-serif}`;
      } catch {
        warn('Failed to read CJK font for PDF', { fontPath });
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
