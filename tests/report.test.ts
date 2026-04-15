import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

    it('should parse key findings from content', async () => {
      const mockLLMResponse = {
        content: '关键发现：发现1，发现2，发现3\n情感分析：积极\n行动建议：建议1',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.keyFindings).toContain('发现1');
      expect(result.keyFindings).toContain('发现2');
      expect(result.keyFindings).toContain('发现3');
    });

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

      expect(result.sentiment).toBe('非常积极');
    });

    it('should parse recommendations from content', async () => {
      const mockLLMResponse = {
        content: '关键发现：test\n情感分析：neutral\n行动建议：建议A，建议B，建议C',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(await import('../src/integrations/llm/volcengine.js')).VolcengineLLM.fromEnv = () =>
        ({ chat: chatMock }) as any;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.recommendations).toContain('建议A');
      expect(result.recommendations).toContain('建议B');
      expect(result.recommendations).toContain('建议C');
    });

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
