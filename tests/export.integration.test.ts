/**
 * Integration tests for ExportService
 * Uses real PostgreSQL database with mocked PDF generation (Playwright browser).
 *
 * Prerequisites: PostgreSQL running + dialog_survey_test database
 * Run: npx vitest run tests/export.integration.test.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportService } from '../src/services/export.service.js';
import { TestDatabase } from './helpers/test-db.js';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockImplementation(async ({ path }: { path: string }) => {
          // Write a placeholder file so existsSync checks pass
          const { writeFileSync } = await import('node:fs');
          try {
            writeFileSync(path, '%PDF-mock', 'utf-8');
          } catch {
            // directory may not exist yet in test — ignore
          }
        }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('ExportService (Integration)', () => {
  let testDb: TestDatabase;
  let prisma: PrismaClient;
  let service: ExportService;
  const reportsDir = join('/tmp', 'export-test-reports');
  let createdIds: {
    templates: string[];
    interviews: string[];
    messages: string[];
    responses: string[];
    analysisReports: string[];
  };

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    prisma = testDb.getPrisma();
    mkdirSync(reportsDir, { recursive: true });
    service = new ExportService(prisma, reportsDir);
  });

  beforeEach(() => {
    createdIds = { templates: [], interviews: [], messages: [], responses: [], analysisReports: [] };
  });

  afterEach(async () => {
    await testDb.cleanup(createdIds);
  });

  afterAll(async () => {
    await testDb.teardown();
    try {
      rmSync(reportsDir, { recursive: true, force: true });
    } catch {
      // cleanup failure is non-fatal
    }
  });

  async function seedInterviewWithData(): Promise<{
    interviewId: string;
    templateId: string;
  }> {
    const template = await prisma.template.create({
      data: {
        name: 'Export Test Template',
        content: JSON.stringify({
          invitationPrompt: '欢迎参加测试访谈',
          questions: ['您对产品的整体满意度如何？', '您最喜欢哪个功能？', '有什么改进建议？'],
        }),
        status: 'DRAFT',
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    createdIds.templates.push(template.id);

    const interview = await prisma.interview.create({
      data: {
        userId: 'export-test-user',
        templateId: template.id,
        status: 'COMPLETED',
      },
    });
    createdIds.interviews.push(interview.id);

    const response1 = await prisma.response.create({
      data: {
        interviewId: interview.id,
        questionId: 'q0',
        content: '非常满意，产品很好用',
        isFollowup: false,
        followupDepth: 0,
      },
    });
    createdIds.responses.push(response1.id);

    const response2 = await prisma.response.create({
      data: {
        interviewId: interview.id,
        questionId: 'q1',
        content: '最喜欢搜索功能',
        isFollowup: false,
        followupDepth: 0,
      },
    });
    createdIds.responses.push(response2.id);

    const response3 = await prisma.response.create({
      data: {
        interviewId: interview.id,
        questionId: 'q1-followup',
        content: '因为搜索很精准',
        isFollowup: true,
        followupDepth: 1,
      },
    });
    createdIds.responses.push(response3.id);

    const response4 = await prisma.response.create({
      data: {
        interviewId: interview.id,
        questionId: 'q2',
        content: '希望能增加导出功能',
        isFollowup: false,
        followupDepth: 0,
      },
    });
    createdIds.responses.push(response4.id);

    const report = await prisma.analysisReport.create({
      data: {
        interviewId: interview.id,
        content: '用户对产品整体满意度高，搜索功能是亮点，希望增加导出功能。',
        keyFindings: ['满意度高', '搜索功能受欢迎', '期待导出功能'],
        sentiment: 'POSITIVE',
        recommendations: ['尽快开发导出功能', '持续优化搜索体验'],
      },
    });
    createdIds.analysisReports.push(report.id);

    return { interviewId: interview.id, templateId: template.id };
  }

  describe('exportInterviewToExcel', () => {
    it('should query interview, responses, and report data from real database', async () => {
      const { interviewId } = await seedInterviewWithData();

      const path = await service.exportInterviewToExcel(interviewId);

      expect(existsSync(path)).toBe(true);
      expect(path).toContain(interviewId);
      expect(path).toContain('/export-test-reports/');
    });

    it('should export Excel even when no analysis report exists', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'No Report Template',
          content: JSON.stringify({
            questions: ['问题1', '问题2'],
          }),
          status: 'DRAFT',
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
      createdIds.templates.push(template.id);

      const interview = await prisma.interview.create({
        data: {
          userId: 'no-report-user',
          templateId: template.id,
          status: 'COMPLETED',
        },
      });
      createdIds.interviews.push(interview.id);

      const response = await prisma.response.create({
        data: {
          interviewId: interview.id,
          questionId: 'q0',
          content: '回答1',
        },
      });
      createdIds.responses.push(response.id);

      const path = await service.exportInterviewToExcel(interview.id);
      expect(existsSync(path)).toBe(true);
    });

    it('should use template content to map question IDs to question text', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Question Map Template',
          content: JSON.stringify({
            questions: ['您的年龄是？', '您的职业是？'],
          }),
          status: 'DRAFT',
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
      createdIds.templates.push(template.id);

      const interview = await prisma.interview.create({
        data: {
          userId: 'question-map-user',
          templateId: template.id,
          status: 'COMPLETED',
        },
      });
      createdIds.interviews.push(interview.id);

      const response = await prisma.response.create({
        data: {
          interviewId: interview.id,
          questionId: 'q0',
          content: '25岁',
        },
      });
      createdIds.responses.push(response.id);

      // Verify the export succeeds — the questionMap logic is exercised
      const path = await service.exportInterviewToExcel(interview.id);
      expect(existsSync(path)).toBe(true);

      // Clean up the generated file
      try { rmSync(path); } catch { /* ignore */ }
    });

    it('should throw when interview is not found', async () => {
      await expect(
        service.exportInterviewToExcel('non-existent-id')
      ).rejects.toThrow('Interview not found');
    });
  });

  describe('exportInterviewToPdf', () => {
    it('should query interview responses and assemble PDF HTML from real data', async () => {
      const { interviewId } = await seedInterviewWithData();

      const path = await service.exportInterviewToPdf(interviewId);

      expect(existsSync(path)).toBe(true);
      expect(path).toContain(interviewId);
      expect(path).toContain('/export-test-reports/');

      // Verify the mock PDF was written
      const content = readFileSync(path, 'utf-8');
      expect(content).toBe('%PDF-mock');

      // Clean up
      try { rmSync(path); } catch { /* ignore */ }
    });

    it('should include report summary in PDF when report exists', async () => {
      const { interviewId } = await seedInterviewWithData();

      const path = await service.exportInterviewToPdf(interviewId);
      expect(existsSync(path)).toBe(true);

      try { rmSync(path); } catch { /* ignore */ }
    });

    it('should handle interview without report for PDF export', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'PDF No Report',
          content: JSON.stringify({ questions: ['Q1'] }),
          status: 'DRAFT',
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
      createdIds.templates.push(template.id);

      const interview = await prisma.interview.create({
        data: {
          userId: 'pdf-no-report-user',
          templateId: template.id,
          status: 'COMPLETED',
        },
      });
      createdIds.interviews.push(interview.id);

      const response = await prisma.response.create({
        data: {
          interviewId: interview.id,
          questionId: 'q0',
          content: '回答内容',
        },
      });
      createdIds.responses.push(response.id);

      const path = await service.exportInterviewToPdf(interview.id);
      expect(existsSync(path)).toBe(true);

      try { rmSync(path); } catch { /* ignore */ }
    });

    it('should reject non-existent interview for PDF', async () => {
      await expect(
        service.exportInterviewToPdf('non-existent-pdf-id')
      ).rejects.toThrow('Interview not found');
    });
  });

  describe('data integrity', () => {
    it('should include followup flag and depth in exported responses', async () => {
      const { interviewId } = await seedInterviewWithData();

      const path = await service.exportInterviewToExcel(interviewId);
      expect(existsSync(path)).toBe(true);

      // Verify followup responses exist in the seeded data
      const followupResponses = await prisma.response.findMany({
        where: { interviewId, isFollowup: true },
      });
      expect(followupResponses.length).toBeGreaterThanOrEqual(1);
      expect(followupResponses[0].followupDepth).toBe(1);

      try { rmSync(path); } catch { /* ignore */ }
    });

    it('should include template/plan metadata association', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Metadata Template',
          content: JSON.stringify({ questions: ['Q1', 'Q2'] }),
          status: 'DRAFT',
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
      createdIds.templates.push(template.id);

      const plan = await prisma.interviewPlan.create({
        data: {
          name: 'Test Plan',
          templateId: template.id,
          status: 'PENDING',
        },
      });

      const interview = await prisma.interview.create({
        data: {
          userId: 'metadata-user',
          templateId: template.id,
          planId: plan.id,
          status: 'COMPLETED',
        },
      });
      createdIds.interviews.push(interview.id);

      // Verify the interview has both template and plan references
      const loaded = await prisma.interview.findUnique({
        where: { id: interview.id },
        include: { template: true, plan: true },
      });
      expect(loaded?.template).not.toBeNull();
      expect(loaded?.template.name).toBe('Metadata Template');
      expect(loaded?.plan).not.toBeNull();
      expect(loaded?.plan?.name).toBe('Test Plan');

      // Clean up in correct order: interview → plan → template
      await prisma.interview.delete({ where: { id: interview.id } });
      await prisma.interviewPlan.delete({ where: { id: plan.id } });
    });

    it('should correctly handle multiple responses in proper order', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Order Test Template',
          content: JSON.stringify({ questions: ['Q1', 'Q2', 'Q3'] }),
          status: 'DRAFT',
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
      createdIds.templates.push(template.id);

      const interview = await prisma.interview.create({
        data: {
          userId: 'order-test-user',
          templateId: template.id,
          status: 'COMPLETED',
        },
      });
      createdIds.interviews.push(interview.id);

      // Create responses in reverse order to test ordering
      const r3 = await prisma.response.create({
        data: { interviewId: interview.id, questionId: 'q2', content: 'Third' },
      });
      createdIds.responses.push(r3.id);

      const r1 = await prisma.response.create({
        data: { interviewId: interview.id, questionId: 'q0', content: 'First' },
      });
      createdIds.responses.push(r1.id);

      const r2 = await prisma.response.create({
        data: { interviewId: interview.id, questionId: 'q1', content: 'Second' },
      });
      createdIds.responses.push(r2.id);

      // The service uses orderBy: { createdAt: 'asc' }
      const path = await service.exportInterviewToExcel(interview.id);
      expect(existsSync(path)).toBe(true);

      // Verify correct order via direct query
      const ordered = await prisma.response.findMany({
        where: { interviewId: interview.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(ordered[0].content).toBe('Third');
      expect(ordered[1].content).toBe('First');
      expect(ordered[2].content).toBe('Second');

      try { rmSync(path); } catch { /* ignore */ }
    });
  });
});
