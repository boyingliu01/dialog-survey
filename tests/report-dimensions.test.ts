import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateReportWithDimensions } from '../src/services/report.service.js';

describe('Report Generation with Dimensions', () => {
  /** @test REQ-SINGLE-001 @intent verify dimensionTags returned from report generation @covers AC-SINGLE-001-01 */
  it('returns dimensionTags when LLM provides valid JSON', async () => {
    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: `{"dimensionTags":[{"dimensionId":"stability","label":"稳定性","sentiment":"negative","quotes":["每次升级要重启3次"]}],"emergentTags":["数据安全担忧"],"interviewerRating":3}`,
      }),
    };

    const result = await generateReportWithDimensions(
      'test-123',
      '测试',
      [{ question: '满意度?', answer: '不太稳定，经常崩溃' }],
      '[{"id":"stability","label":"稳定性","keywords":["崩溃"]}]',
      mockLLM as any
    );

    expect(result.dimensionTags).toHaveLength(1);
    expect(result.dimensionTags![0].sentiment).toBe('negative');
    expect(result.emergentTags).toContain('数据安全担忧');
  });

  /** @test REQ-SINGLE-001 @intent verify empty dimensionTags when dimensions is null @covers AC-SINGLE-001-02 */
  it('returns empty dimensionTags when dimensions is not defined', async () => {
    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: `{"dimensionTags":[],"emergentTags":["一般问题"],"interviewerRating":3}`,
      }),
    };

    const result = await generateReportWithDimensions(
      'test-456',
      '测试',
      [{ question: '你好', answer: '还行' }],
      null as any,
      mockLLM as any
    );

    expect(result.dimensionTags).toEqual([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
