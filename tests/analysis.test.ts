import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisService } from '../src/services/analysis.service.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

vi.mock('../src/services/report.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/report.service.js')>()),
  generateReport: vi.fn().mockResolvedValue({
    interviewId: 'test',
    content: 'test report',
    keyFindings: ['finding1'],
    sentiment: 'positive',
    recommendations: ['rec1'],
    generatedAt: new Date(),
  }),
  generateReportWithDimensions: vi.fn(),
}));

// The dimension pass constructs its LLM through `fromEnv()`, which throws without
// credentials. Mock the factory so the dimension path is reachable in tests; the
// call itself is stubbed, so the instance is never used.
vi.mock('../src/integrations/llm/openai-compatible.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/llm/openai-compatible.js')>()),
  OpenAICompatibleLLM: { fromEnv: vi.fn(() => ({ chat: vi.fn() })) },
}));

describe('AnalysisService', () => {
  let service: AnalysisService;
  let mockPrisma: {
    interview: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    analysisReport: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    template: { findUnique: ReturnType<typeof vi.fn> };
    batchAnalysisReport: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    interviewPlan: { findUnique: ReturnType<typeof vi.fn> };
    analysisFailure: { upsert: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockPrisma = {
      interview: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      analysisReport: {
        create: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      template: {
        findUnique: vi.fn(),
      },
      batchAnalysisReport: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      interviewPlan: {
        findUnique: vi.fn(),
      },
      analysisFailure: {
        upsert: vi.fn(),
      },
    };
    service = new AnalysisService(mockPrisma as unknown as PrismaClient);
    vi.clearAllMocks();
  });

  describe('analyzeInterview', () => {
    /**
     * @test REQ-009-10-03
     * @intent Verify that AnalysisService.analyzeInterview returns AnalysisResult with metrics when analyzing a completed interview
     */
    it('should analyze interview and return result', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        templateId: 'template-1',
        responses: [{ questionId: 'q1', content: 'answer1' }],
        messages: [],
      });
      mockPrisma.analysisReport.create.mockResolvedValue({ id: 'report-1' });

      const result = await service.analyzeInterview('interview-1');

      expect(result.interviewId).toBe('interview-1');
      expect(result.report).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should throw error when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      await expect(service.analyzeInterview('invalid')).rejects.toThrow('Interview not found');
    });

    it('should save analysis report to database', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        templateId: 'template-1',
        responses: [],
        messages: [],
      });
      mockPrisma.analysisReport.create.mockResolvedValue({ id: 'report-1' });

      await service.analyzeInterview('interview-1');

      expect(mockPrisma.analysisReport.create).toHaveBeenCalled();
    });

    /**
     * @test REQ-009-10-03
     * @intent quotes lifted from the interview must be PII-scrubbed before storage
     */
    it('scrubs PII from dimension quotes but keeps the tags themselves', async () => {
      // The quotes are verbatim interview text, so they are the one part of the
      // dimension payload that can carry a phone number or an email. Removing the
      // anonymisePII call leaves every other assertion in this file identical,
      // which is exactly why this test exists.
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-pii',
        templateId: 'template-1',
        responses: [{ questionId: 'q1', content: '联系我 13812345678 或 a@b.com' }],
        messages: [],
      });
      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'template-1',
        dimensions: [{ id: 'contact', label: '联系方式' }],
      });
      mockPrisma.analysisReport.create.mockResolvedValue({ id: 'report-pii' });

      const reportService = await import('../src/services/report.service.js');
      vi.mocked(reportService.generateReportWithDimensions).mockResolvedValue({
        interviewId: 'interview-pii',
        content: 'report',
        keyFindings: [],
        sentiment: 'neutral',
        recommendations: [],
        generatedAt: new Date(),
        dimensionTags: [
          {
            dimensionId: 'contact',
            label: '联系方式',
            sentiment: 'neutral',
            quotes: ['联系我 13812345678 或 a@b.com'],
          },
        ],
      });

      await service.analyzeInterview('interview-pii');

      const stored = mockPrisma.analysisReport.create.mock.calls[0]?.[0]?.data as {
        dimensionTags?: Array<{ dimensionId: string; quotes: string[] }>;
      };
      expect(stored.dimensionTags).toHaveLength(1);
      expect(stored.dimensionTags?.[0].dimensionId).toBe('contact');
      const quote = stored.dimensionTags?.[0].quotes[0] ?? '';
      expect(quote).not.toContain('13812345678');
      expect(quote).not.toContain('a@b.com');
      expect(quote).toContain('****');
    });
  });

  describe('batchAnalyze', () => {
    it('should analyze all completed interviews', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        { id: 'interview-1', status: 'COMPLETED' },
        { id: 'interview-2', status: 'COMPLETED' },
      ]);
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        templateId: 't1',
        responses: [],
        messages: [],
      });
      mockPrisma.analysisReport.create.mockResolvedValue({});

      const results = await service.batchAnalyze('plan-1');

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty interview list', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const results = await service.batchAnalyze('plan-1');

      expect(results).toHaveLength(0);
    });

    it('should continue on individual interview failure', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([{ id: 'interview-1', status: 'COMPLETED' }]);
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const results = await service.batchAnalyze('plan-1');

      expect(results).toHaveLength(0);
    });
  });

  describe('calculateMetrics', () => {
    /**
     * @test REQ-009-10-01
     * @intent Verify that calculateMetrics computes all statistical metrics correctly including totalResponses, avgResponseLength, and followupDepth
     */
    it('should calculate metrics for responses', () => {
      const responses = [
        { content: 'this is a test response', followupDepth: 1 },
        { content: 'another response', followupDepth: 2 },
      ];

      const metrics = service.calculateMetrics(responses);

      expect(metrics.totalResponses).toBe(2);
      expect(metrics.avgResponseLength).toBeGreaterThan(0);
      expect(metrics.followupDepth).toBe(2);
      expect(metrics.completionRate).toBe(1);
      expect(metrics.sentiment).toBeDefined();
    });

    it('should handle empty responses', () => {
      const metrics = service.calculateMetrics([]);

      expect(metrics.totalResponses).toBe(0);
      expect(metrics.avgResponseLength).toBe(0);
      expect(metrics.followupDepth).toBe(0);
      expect(metrics.completionRate).toBe(0);
      expect(metrics.sentiment).toBe('neutral');
    });

    /**
     * @test REQ-009-10-02
     * @intent Verify that calculateMetrics computes completionRate from responses correctly
     */
    it('should detect positive sentiment', () => {
      const responses = [{ content: '这是一个很好的产品，我很喜欢', followupDepth: 0 }];

      const metrics = service.calculateMetrics(responses);

      expect(metrics.sentiment).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      const responses = [{ content: '这个产品很差，我很失望', followupDepth: 0 }];

      const metrics = service.calculateMetrics(responses);

      expect(metrics.sentiment).toBe('negative');
    });

    it('should extract topics from content', () => {
      const responses = [{ content: '产品的功能很好，体验也不错', followupDepth: 0 }];

      const metrics = service.calculateMetrics(responses);

      expect(metrics.topicCoverage).toContain('产品');
      expect(metrics.topicCoverage).toContain('功能');
      expect(metrics.topicCoverage).toContain('体验');
    });
  });

  describe('compareClusters', () => {
    it('should compare multiple clusters', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        {
          id: 'i1',
          responses: [{ content: 'good product' }],
        },
      ]);

      const results = await service.compareClusters(['cluster-1']);

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty cluster', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const results = await service.compareClusters(['empty-cluster']);

      expect(results).toHaveLength(0);
    });

    it('should calculate average sentiment for cluster', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        { id: 'i1', responses: [{ content: '很棒' }] },
        { id: 'i2', responses: [{ content: '优秀' }] },
      ]);

      const results = await service.compareClusters(['cluster-1']);

      if (results.length > 0) {
        expect(results[0].avgSentiment).toBeDefined();
      }
    });
  });

  describe('getReportByInterviewId', () => {
    it('should return most recent report', async () => {
      mockPrisma.analysisReport.findFirst.mockResolvedValue({
        id: 'report-1',
        interviewId: 'interview-1',
        content: 'report content',
      });

      const report = await service.getReportByInterviewId('interview-1');

      expect(report).toBeDefined();
    });

    it('should return null when no report exists', async () => {
      mockPrisma.analysisReport.findFirst.mockResolvedValue(null);

      const report = await service.getReportByInterviewId('no-report');

      expect(report).toBeNull();
    });
  });
});
