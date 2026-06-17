import type { BatchAnalysisReport } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { error, info } from '../utils/logger.js';
import { anonymizePII } from '../utils/pii-anonymizer.js';
import { recordAnalysisFailure } from './dead-letter.service.js';
import {
  type Report,
  type ReportWithDimensions,
  generateReport,
  generateReportWithDimensions,
} from './report.service.js';

export interface AnalysisResult {
  interviewId: string;
  report: Report;
  metrics: StatisticalMetrics;
}

export interface StatisticalMetrics {
  totalResponses: number;
  avgResponseLength: number;
  followupDepth: number;
  completionRate: number;
  sentiment: string;
  topicCoverage: string[];
}

export interface ClusterAnalysis {
  clusterId: string;
  name: string;
  memberCount: number;
  avgSentiment: string;
  keyThemes: string[];
  representativeViewpoints: string[];
}

export type CreateBatchReportResult =
  | { kind: 'created'; report: BatchAnalysisReport }
  | { kind: 'conflict'; existingId: string }
  | { kind: 'no-completed' }
  | { kind: 'plan-not-found' };

export class AnalysisService {
  private readonly _prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this._prisma = prisma;
  }

  async analyzeInterview(interviewId: string): Promise<AnalysisResult> {
    const interview = await this._prisma.interview.findUnique({
      where: { id: interviewId },
      include: { responses: true, messages: true },
    });

    if (!interview) {
      throw new Error('Interview not found');
    }

    const qaPairs = interview.responses.map((r) => ({
      question: r.questionId,
      answer: r.content,
    }));

    const topic = interview.templateId;
    const report = await generateReport(interviewId, topic, qaPairs);

    const metrics = this.calculateMetrics(interview.responses);

    let dimResult: ReportWithDimensions = {
      interviewId,
      content: '',
      keyFindings: [],
      sentiment: '',
      recommendations: [],
      generatedAt: new Date(),
      dimensionTags: [],
      emergentTags: [],
    };

    try {
      const template = await this._prisma.template.findUnique({
        where: { id: interview.templateId },
      });
      const dimsJson = template?.dimensions ? JSON.stringify(template.dimensions) : null;

      if (dimsJson) {
        const { OpenAICompatibleLLM } = await import('../integrations/llm/openai-compatible.js');
        const llm = OpenAICompatibleLLM.fromEnv();
        dimResult = await generateReportWithDimensions(interviewId, topic, qaPairs, dimsJson, llm);
        dimResult.dimensionTags = dimResult.dimensionTags?.map((tag) => ({
          ...tag,
          quotes: tag.quotes.map((q: string) => anonymizePII(q)),
        }));
      }
    } catch (e) {
      error('Dimension analysis failed', {
        interviewId,
        error: e instanceof Error ? e.message : String(e),
      });
      await recordAnalysisFailure(
        this._prisma,
        interviewId,
        'DIMENSION_ANALYSIS_FAILED',
        e instanceof Error ? e.message : String(e)
      );
    }

    await this._prisma.analysisReport.create({
      data: {
        interviewId,
        content: report.content,
        keyFindings: report.keyFindings,
        sentiment: report.sentiment,
        recommendations: report.recommendations,
        dimensionTags: dimResult.dimensionTags?.length ? dimResult.dimensionTags : undefined,
        emergentTags: dimResult.emergentTags?.length ? dimResult.emergentTags : undefined,
        interviewerRating: dimResult.interviewerRating ?? undefined,
      },
    });

    return { interviewId, report, metrics };
  }

  async batchAnalyze(planId: string): Promise<AnalysisResult[]> {
    const interviews = await this._prisma.interview.findMany({
      where: { planId, status: 'COMPLETED' },
    });

    info('Batch analyzing interviews', { planId, count: interviews.length });

    const results: AnalysisResult[] = [];
    for (const interview of interviews) {
      try {
        const result = await this.analyzeInterview(interview.id);
        results.push(result);
      } catch (e) {
        info('Failed to analyze interview', {
          interviewId: interview.id,
          error: e,
        });
      }
    }

    return results;
  }

  calculateMetrics(
    responses: Array<{ content: string; followupDepth: number }>
  ): StatisticalMetrics {
    const totalResponses = responses.length;
    const avgResponseLength =
      totalResponses > 0
        ? responses.reduce((sum, r) => sum + r.content.length, 0) / totalResponses
        : 0;
    const followupDepth = Math.max(...responses.map((r) => r.followupDepth), 0);
    const completionRate = totalResponses > 0 ? 1 : 0;

    const sentiment = this.analyzeSentiment(responses.map((r) => r.content));

    return {
      totalResponses,
      avgResponseLength: Math.round(avgResponseLength),
      followupDepth,
      completionRate,
      sentiment,
      topicCoverage: this.extractTopics(responses.map((r) => r.content)),
    };
  }

  private analyzeSentiment(contents: string[]): string {
    const positiveWords = [
      '好',
      '喜欢',
      '优秀',
      '满意',
      '棒',
      '感谢',
      'great',
      'good',
      'excellent',
    ];
    const negativeWords = ['差', '不好', '失望', '糟糕', 'bad', 'poor', 'terrible'];

    let score = 0;
    const text = contents.join('').toLowerCase();

    for (const word of positiveWords) {
      if (text.includes(word)) score++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) score--;
    }

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  private extractTopics(contents: string[]): string[] {
    const topics = new Set<string>();
    const keywords = ['产品', '功能', '体验', '服务', '价格', '质量', '技术', '团队', '市场'];

    const text = contents.join('');

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        topics.add(keyword);
      }
    }

    return Array.from(topics);
  }

  async compareClusters(clusterIds: string[]): Promise<ClusterAnalysis[]> {
    const clusters: ClusterAnalysis[] = [];

    for (const clusterId of clusterIds) {
      const interviews = await this._prisma.interview.findMany({
        where: { planId: clusterId },
        include: { responses: true },
      });

      if (interviews.length === 0) continue;

      const allContent = interviews.flatMap((i) => i.responses.map((r) => r.content));
      const sentiments = allContent.map((c) => this.analyzeSentiment([c]));

      const avgSentiment =
        sentiments.filter((s) => s === 'positive').length >
        sentiments.filter((s) => s === 'negative').length
          ? 'positive'
          : 'neutral';

      clusters.push({
        clusterId,
        name: `Cluster ${clusterId}`,
        memberCount: interviews.length,
        avgSentiment,
        keyThemes: this.extractTopics(allContent),
        representativeViewpoints: allContent.slice(0, 3),
      });
    }

    return clusters;
  }

  async getReportByInterviewId(interviewId: string) {
    return this._prisma.analysisReport.findFirst({
      where: { interviewId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBatchReportIfEligible(planId: string): Promise<CreateBatchReportResult> {
    const existing = await this._prisma.batchAnalysisReport.findFirst({
      where: { planId, status: 'RUNNING' },
      select: { id: true },
    });
    if (existing) {
      return { kind: 'conflict', existingId: existing.id };
    }

    const completed = await this._prisma.interview.findFirst({
      where: { planId, status: 'COMPLETED' },
      select: { id: true },
    });
    if (!completed) {
      return { kind: 'no-completed' };
    }

    const plan = await this._prisma.interviewPlan.findUnique({
      where: { id: planId },
      select: { templateId: true },
    });
    if (!plan) {
      return { kind: 'plan-not-found' };
    }

    const report = await this._prisma.batchAnalysisReport.create({
      data: {
        planId,
        templateId: plan.templateId,
        type: 'SUMMARY',
        status: 'PENDING',
        content: '',
        metrics: {},
        topics: {},
        emergents: [],
      },
    });
    return { kind: 'created', report };
  }

  async getBatchReportById(id: string): Promise<BatchAnalysisReport | null> {
    return this._prisma.batchAnalysisReport.findUnique({
      where: { id },
    });
  }

  async findRecentReports(limit: number) {
    return this._prisma.analysisReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { interview: { select: { id: true, userId: true, status: true } } },
    });
  }
}
