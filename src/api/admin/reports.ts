// @no-test-required: covered by tests/admin-route-coverage.test.ts, tests/admin-templates-extra.test.ts and tests/e2e/admin-*.e2e.test.ts
import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { adminAuth } from '../../middleware/admin-auth.js';
import { error } from '../../utils/logger.js';
import { buildQuestionMap } from '../../utils/template-content.js';
import { analysisSectionLines, reportHeaderLines, transcriptLines } from './report-view.js';
import { type AdminRoutesDeps, createAdminGuard } from './shared.js';
import { findInviteeInfo, fmtDate } from './view-models.js';

const BASE_PATH = '/admin';
const API_PATH = '/admin/api';

/**
 * Interview/report viewing: the reports list and detail shell pages, the
 * report-detail fragment, the analysis-view page and the download/export
 * endpoints (`Markdown`, `PDF`, `Excel`) plus re-analysis.
 *
 * Everything here reads an interview through `interviewRepo`'s report readers
 * and renders or streams it; nothing writes template or plan state.
 */
export async function registerReportRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesDeps
): Promise<void> {
  const { interviewRepo, interviewPlanRepo, analysisService, exportService } = opts;
  const adminMutationGuard = createAdminGuard(fastify);

  /**
   * The invitee's name/phone for an interview, looked up from its plan.
   *
   * Shared by the three report surfaces so an interview rendered for viewing and
   * one rendered for export can never disagree about the invitee.
   */
  const inviteeFor = async (
    planId: string | null | undefined,
    userId: string
  ): Promise<{ name?: string; phone?: string }> => {
    if (!planId) return {};
    const plan = await interviewPlanRepo.findInviteeData(planId);
    return findInviteeInfo(plan?.inviteeData, userId);
  };

  // GET /admin/content/reports/:interviewId — HTMX report-detail fragment
  fastify.get(
    '/admin/content/reports/:interviewId',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      const interview = await interviewRepo.findByIdForReportDetail(interviewId);
      if (!interview) return reply.status(404).type('text/html').send('访谈不存在');
      const report = await analysisService.getReportByInterviewId(interviewId);

      const questionMap = buildQuestionMap(interview.template?.content);

      const inviteeInfo = await inviteeFor(interview.planId, interview.userId);

      return reply.view('admin/content/report-detail.njk', {
        interview,
        report,
        inviteeInfo,
        questionMap,
      });
    }
  );

  // GET /admin/api/reports/:interviewId/download - download report as Markdown file
  fastify.get(
    `${API_PATH}/reports/:interviewId/download`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      const interview = await interviewRepo.findByIdForReportExport(interviewId);
      if (!interview) {
        return reply.status(404).type('text/plain').send('Interview not found');
      }

      const report = await analysisService.getReportByInterviewId(interviewId);
      const inviteeInfo = await inviteeFor(interview.planId, interview.userId);

      const lines: string[] = ['# 访谈报告', ''];
      lines.push(...reportHeaderLines(interview, inviteeInfo));
      lines.push(...transcriptLines(interview.messages));
      if (report) lines.push(...analysisSectionLines(report));

      const markdown = lines.join('\n');
      const filename = `interview-report-${interviewId}.md`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(markdown);
    }
  );

  // GET /admin/api/reports/:interviewId/export/pdf — download report as PDF
  fastify.get(
    `${API_PATH}/reports/:interviewId/export/pdf`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      if (!exportService) {
        return reply.status(500).type('text/plain').send('PDF export not available');
      }
      try {
        const pdfPath = await exportService.exportInterviewToPdf(interviewId);
        const pdfBuffer = readFileSync(pdfPath);
        const filename = `interview-report-${interviewId}.pdf`;
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(pdfBuffer);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'PDF export failed';
        error('PDF export failed', { interviewId, error: errMsg });
        return reply.status(500).type('text/plain').send(errMsg);
      }
    }
  );

  // GET /admin/api/reports/:interviewId/export/excel — download report as Excel
  fastify.get(
    `${API_PATH}/reports/:interviewId/export/excel`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      if (!exportService) {
        return reply.status(500).type('text/plain').send('Excel export not available');
      }
      try {
        const xlsxPath = await exportService.exportInterviewToExcel(interviewId);
        const xlsxBuffer = readFileSync(xlsxPath);
        const filename = `interview-report-${interviewId}.xlsx`;
        return reply
          .header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(xlsxBuffer);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Excel export failed';
        error('Excel export failed', { interviewId, error: errMsg });
        return reply.status(500).type('text/plain').send(errMsg);
      }
    }
  );

  // POST /admin/api/reports/:interviewId/reanalyze - regenerate analysis report
  fastify.post(
    `${API_PATH}/reports/:interviewId/reanalyze`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      try {
        const result = await analysisService.analyzeInterview(interviewId);
        return reply.send({
          success: true,
          interviewId: result.interviewId,
          sentiment: result.report.sentiment,
          keyFindingsCount: result.report.keyFindings.length,
          recommendationsCount: result.report.recommendations.length,
          usedLLM: result.report.usedLLM ?? false,
          contentLength: result.report.content.length,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Analysis failed';
        error('Reanalysis failed', { interviewId, error: errMsg });
        return reply.status(500).send({ error: errMsg });
      }
    }
  );

  // GET /admin/reports — the reports list shell page
  fastify.get(
    `${BASE_PATH}/reports`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const reports = await analysisService.findRecentReports(100);
        return reply.view('reports/index.njk', {
          reports: reports.map((r) => ({
            interviewId: r.interviewId,
            userId: r.interview?.userId ?? '-',
            status: r.interview?.status ?? '-',
            sentiment: r.sentiment ?? '',
            createdAtFormatted: fmtDate(r.createdAt),
          })),
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load reports';
        error('Failed to load admin reports', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  // GET /admin/reports/:interviewId — the reports detail shell page
  fastify.get(
    `${BASE_PATH}/reports/:interviewId`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      try {
        const report = await analysisService.getReportByInterviewId(interviewId);
        const interviewData = await interviewRepo.findByIdForAnalysisView(interviewId);
        if (!interviewData)
          return reply.status(404).view('error.njk', { message: 'Interview not found' });

        const inviteeInfo = await inviteeFor(interviewData.planId, interviewData.userId);

        return reply.view('reports/detail.njk', {
          interview: { ...interviewData, createdAtFormatted: fmtDate(interviewData.createdAt) },
          inviteeInfo,
          report: report
            ? { ...report, createdAtFormatted: fmtDate((report as { createdAt?: Date }).createdAt) }
            : null,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load report';
        error('Failed to load report detail', { error: errMsg, interviewId });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );
}
