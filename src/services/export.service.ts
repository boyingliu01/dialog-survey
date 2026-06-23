import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { info } from '../utils/logger.js';

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

    const html = this.renderPdfHtml(interview, report);
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

    // Sheet 1: Responses
    const rows = interview.responses.map((r) => ({
      questionId: r.questionId,
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
    } | null
  ): string {
    const responseRows = interview.responses
      .map(
        (r, i) => `<tr>
          <td style="border:1px solid #ccc;padding:6px;text-align:center">${i + 1}</td>
          <td style="border:1px solid #ccc;padding:6px">${this.escapeHtml(r.questionId)}</td>
          <td style="border:1px solid #ccc;padding:6px">${this.escapeHtml(r.content)}</td>
          <td style="border:1px solid #ccc;padding:6px;text-align:center">${r.isFollowup ? '是' : '否'}</td>
          <td style="border:1px solid #ccc;padding:6px;text-align:center">${r.followupDepth}</td>
        </tr>`
      )
      .join('\n');

    const reportHtml = report
      ? `<h3 style="margin-top:20px;color:#333">报告摘要</h3>
         <p style="color:#555;line-height:1.6">${this.escapeHtml(report.content).replace(/\n/g, '<br>')}</p>
         ${report.keyFindings?.length ? `<h4 style="margin-top:12px;color:#555">关键发现</h4><ul>${report.keyFindings.map((f) => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>` : ''}
         ${report.recommendations?.length ? `<h4 style="margin-top:12px;color:#555">建议</h4><ul>${report.recommendations.map((r) => `<li>${this.escapeHtml(r)}</li>`).join('')}</ul>` : ''}`
      : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>访谈报告 - ${this.escapeHtml(interview.userId)}</title>
<style>
  body { font-family: sans-serif; color: #333; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin-top: 16px; margin-bottom: 8px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f5f5f5; border: 1px solid #ccc; padding: 6px; text-align: left; font-weight: 600; }
</style></head>
<body>
  <h1>访谈报告</h1>
  <p style="color:#666">用户: ${this.escapeHtml(interview.userId)} | 状态: ${this.escapeHtml(interview.status)}</p>

  <h2>访谈回答</h2>
  <table>
    <thead><tr>
      <th style="border:1px solid #ccc;padding:6px;text-align:center;width:40px">#</th>
      <th style="border:1px solid #ccc;padding:6px">问题ID</th>
      <th style="border:1px solid #ccc;padding:6px">回答</th>
      <th style="border:1px solid #ccc;padding:6px;text-align:center;width:50px">追问</th>
      <th style="border:1px solid #ccc;padding:6px;text-align:center;width:60px">追问深度</th>
    </tr></thead>
    <tbody>${responseRows}</tbody>
  </table>

  ${reportHtml}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
