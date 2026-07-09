import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { info, warn } from '../utils/logger.js';

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

export class ExportService {
  private readonly reportsDir: string;

  constructor(
    private prisma: PrismaClient,
    reportsDir?: string
  ) {
    this.reportsDir = reportsDir ?? process.env['REPORTS_DIR'] ?? './reports';
    mkdirSync(this.reportsDir, { recursive: true });
  }

  async exportInterviewToPdf(interviewId: string): Promise<string> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        userId: true,
        status: true,
        templateId: true,
        planId: true,
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
        responses: {
          select: { questionId: true, content: true, isFollowup: true, followupDepth: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    const report = await this.prisma.analysisReport.findFirst({
      where: { interviewId },
      orderBy: { createdAt: 'desc' },
      select: { content: true, keyFindings: true, sentiment: true, recommendations: true },
    });

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
        id: true,
        userId: true,
        status: true,
        templateId: true,
        template: { select: { content: true } },
        responses: {
          select: { questionId: true, content: true, isFollowup: true, followupDepth: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    const report = await this.prisma.analysisReport.findFirst({
      where: { interviewId },
      orderBy: { createdAt: 'desc' },
      select: { content: true, keyFindings: true, sentiment: true, recommendations: true },
    });

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
    // Load CJK font for Chinese text rendering in PDF
    let fontFaceCss = '';
    const fontPath = join(this.reportsDir, 'NotoSansCJKsc-Regular.otf');
    if (existsSync(fontPath)) {
      try {
        const fontBase64 = readFileSync(fontPath).toString('base64');
        fontFaceCss = `@font-face{font-family:'NotoSansCJK';src:url(data:font/opentype;base64,${fontBase64})}body{font-family:'NotoSansCJK',sans-serif}`;
      } catch {
        warn('Failed to load CJK font for PDF', { fontPath });
      }
    }
    if (!fontFaceCss) {
      fontFaceCss = 'body{font-family:"Noto Sans CJK SC","Noto Sans SC","Noto Sans",sans-serif}';
    }

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

    const reportHtml = report
      ? `<h2 style="margin-top:24px;color:#333">访谈分析总结</h2>
         <div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:4px;padding:12px;margin-top:8px">
           <p style="color:#555;line-height:1.6">${this.escapeHtml(report.content).replace(/\n/g, '<br>')}</p>
           ${report.keyFindings?.length ? `<h4 style="margin-top:12px;color:#555">关键发现</h4><ul>${report.keyFindings.map((f) => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>` : ''}
           ${report.sentiment ? `<p style="margin-top:8px;color:#555">情感分析: <strong>${this.escapeHtml(this.translateSentiment(report.sentiment))}</strong></p>` : ''}
           ${report.recommendations?.length ? `<h4 style="margin-top:12px;color:#555">建议</h4><ul>${report.recommendations.map((r) => `<li>${this.escapeHtml(r)}</li>`).join('')}</ul>` : ''}
         </div>`
      : '';

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
    if (!contentJson) return {};
    try {
      const parsed = JSON.parse(contentJson) as { questions?: string[] };
      const questions = parsed.questions || [];
      const map: Record<string, string> = {};
      for (let i = 0; i < questions.length; i++) {
        map[`q${i}`] = questions[i];
      }
      return map;
    } catch {
      return {};
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
