import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReport } from '../src/services/report.service.js';

vi.mock('../src/integrations/llm/volcengine.js', () => ({
  VolcengineLLM: {
    fromEnv: () => ({
      chat: vi.fn(),
    }),
  },
  DEFAULT_MODEL: 'deepseek-v3.2',
}));

vi.mock('../src/utils/retry.js', () => ({
  withRetry: vi.fn((fn) => fn()),
}));

describe('Report Service', () => {
  beforeEach(() => {
    vi.stubEnv('VOLCENGINE_API_KEY', 'test-key');
    vi.stubEnv('REPORTS_DIR', '/tmp/reports');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('generateReport', () => {
    /**
     * @test REQ-006-2-01
     * @intent 测试LLM能否成功生成包含关键发现的报告
     */
    it('should generate report with LLM response', async () => {
      const mockLLMResponse = {
        content: '关键发现：候选人有5年经验\n情感分析：积极\n行动建议：建议进一步面试',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', '工作经历', [
        { question: '请介绍你的工作经历', answer: '我在科技公司工作了5年' },
      ]);

      expect(result.interviewId).toBe('interview-123');
      expect(result.content).toContain('关键发现');
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.sentiment).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    /**
     * @test REQ-006-2-01
     * @intent 测试当LLM调用失败时是否能生成回退报告
     */
    it('should create fallback report when LLM fails', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('LLM error'));
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', '工作经历', [
        { question: '请介绍你的工作经历', answer: '我在科技公司工作了5年' },
      ]);

      expect(result.interviewId).toBe('interview-123');
      expect(result.sentiment).toBe('neutral');
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain('建议进行更深入的后续访谈');
    });

    /**
     * @test REQ-006-2-02
     * @intent 测试报告生成服务能否正确解析情感分析结果
     */
    it('should parse sentiment from content', async () => {
      const mockLLMResponse = {
        content: '关键发现：test\n情感分析：非常积极\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.sentiment).toBe('positive');
    });

    /**
     * @test REQ-006-2-01
     * @intent 测试报告生成服务能否处理空问答对参数
     */
    it('should handle empty qaPairs', async () => {
      const mockLLMResponse = {
        content: '关键发现：无\n情感分析：neutral\n行动建议：无',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', 'test', []);

      expect(result.interviewId).toBe('interview-123');
    });

    /**
     * @test REQ-006-3-01
     * @intent 测试报告生成服务能否限制关键发现数量不超过5个
     */
    it('should limit key findings to 5 items', async () => {
      const mockLLMResponse = {
        content:
          '关键发现：发现1，发现2，发现3，发现4，发现5，发现6，发现7\n情感分析：neutral\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.keyFindings.length).toBeLessThanOrEqual(5);
    });

    /**
     * @test REQ-006-3-01
     * @intent 测试报告生成服务是否设置了生成时间戳
     */
    it('should set generatedAt timestamp', async () => {
      const mockLLMResponse = {
        content: '关键发现：test\n情感分析：neutral\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const beforeTime = new Date();
      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);
      const afterTime = new Date();

      expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.generatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
