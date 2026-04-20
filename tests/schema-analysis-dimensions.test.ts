import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

describe('Schema: Analysis Dimensions', () => {
  describe('Template model', () => {
    /**
     * @test REQ-TEMPLATE-001
     * @intent 验证模板支持 dimensions 字段（可空 JSON）
     * @covers AC-TEMPLATE-001-01
     */
    it('should have dimensions field (nullable JSON)', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Test Dimensions Schema',
          content: JSON.stringify({ questions: [] }),
          dimensions: [{ id: 'stability', label: '稳定性', keywords: [] }],
        },
      });

      expect(template.dimensions).toBeDefined();
      expect(template.dimensions).not.toBeNull();

      await prisma.template.delete({ where: { id: template.id } });
    });

    /**
     * @test REQ-TEMPLATE-001
     * @intent 验证模板支持 analysisConfig 字段（可空 JSON）
     * @covers AC-TEMPLATE-001-01
     */
    it('should have analysisConfig field (nullable JSON)', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Test Analysis Config Schema',
          content: JSON.stringify({ questions: [] }),
          analysisConfig: { emergentThreshold: 3 },
        },
      });

      expect(template.analysisConfig).toBeDefined();

      await prisma.template.delete({ where: { id: template.id } });
    });

    /**
     * @test REQ-TEMPLATE-001
     * @intent 验证零配置模式：模板可以没有 dimensions
     * @covers AC-TEMPLATE-001-03
     */
    it('should allow null dimensions (zero-config mode)', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Test Zero Config',
          content: JSON.stringify({ questions: [] }),
        },
      });

      expect(template.dimensions).toBeNull();

      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('AnalysisReport model', () => {
    /**
     * @test REQ-SINGLE-001
     * @intent 验证分析报告支持 dimensionTags、emergentTags、interviewerRating 字段
     * @covers AC-SINGLE-001-01
     */
    it('should have dimensionTags field (nullable JSON)', async () => {
      const [interview, template] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: {
            name: 'Test Interview for Report',
            content: JSON.stringify({ questions: [] }),
          },
        });
        const i = await tx.interview.create({
          data: {
            userId: 'user-schema-test',
            templateId: t.id,
            status: 'COMPLETED',
          },
        });
        return [i, t];
      });

      const report = await prisma.analysisReport.create({
        data: {
          interviewId: interview.id,
          content: '# Test Report',
          keyFindings: ['Test finding'],
          dimensionTags: [
            {
              dimensionId: 'stability',
              label: '稳定性',
              sentiment: 'negative',
              quotes: ['test'],
            },
          ],
          emergentTags: ['new issue'],
          interviewerRating: 4,
        },
      });

      expect(report.dimensionTags).toBeDefined();
      expect(report.emergentTags).toEqual(['new issue']);
      expect(report.interviewerRating).toBe(4);

      await prisma.$transaction(async (tx) => {
        await tx.analysisReport.deleteMany({
          where: { interviewId: interview.id },
        });
        await tx.interview.delete({ where: { id: interview.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });
  });

  describe('BatchAnalysisReport model', () => {
    /**
     * @test REQ-BATCH-001
     * @intent 验证批量分析报告使用正确的枚举和关系字段
     * @covers AC-BATCH-001-01
     */
    it('should have proper enums and relation fields', async () => {
      const [template, plan] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: {
            name: 'Test Batch Template',
            content: JSON.stringify({ questions: [] }),
          },
        });
        const p = await tx.interviewPlan.create({
          data: {
            name: 'Test Batch Plan',
            templateId: t.id,
            status: 'PENDING',
          },
        });
        return [t, p];
      });

      const report = await prisma.batchAnalysisReport.create({
        data: {
          planId: plan.id,
          templateId: template.id,
          type: 'SUMMARY',
          status: 'PENDING',
          content: '# Test Batch Report',
          metrics: { dimensions: [] },
          topics: {},
          emergents: {},
        },
      });

      expect(report.status).toBe('PENDING');
      expect(report.type).toBe('SUMMARY');
      expect(report.checkpoint).toBeNull();

      await prisma.$transaction(async (tx) => {
        await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
        await tx.interviewPlan.delete({ where: { id: plan.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });

    /**
     * @test REQ-BATCH-006
     * @intent 验证批量分析报告的 checkpoint 字段支持失败恢复
     * @covers AC-BATCH-006-01
     */
    it('should track checkpoint for failure recovery', async () => {
      const [template, plan] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: { name: 'Test Checkpoint', content: JSON.stringify({}) },
        });
        const p = await tx.interviewPlan.create({
          data: {
            name: 'Test Checkpoint Plan',
            templateId: t.id,
            status: 'PENDING',
          },
        });
        return [t, p];
      });

      const report = await prisma.batchAnalysisReport.create({
        data: {
          planId: plan.id,
          templateId: template.id,
          type: 'SUMMARY',
          status: 'RUNNING',
          content: '',
          metrics: {},
          topics: {},
          emergents: {},
          checkpoint: {
            completedStep: 1,
            dimensionStats: { stability: { mentionRate: 0.62 } },
          },
        },
      });

      expect(report.checkpoint).toHaveProperty('completedStep');

      await prisma.$transaction(async (tx) => {
        await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
        await tx.interviewPlan.delete({ where: { id: plan.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
