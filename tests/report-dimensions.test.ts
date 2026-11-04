import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenAICompatibleLLM } from '../src/integrations/llm/openai-compatible.js';
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
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.dimensionTags).toHaveLength(1);
    expect(result.dimensionTags?.[0].sentiment).toBe('negative');
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
      null,
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.dimensionTags).toEqual([]);
  });

  /**
   * @test REQ-SINGLE-001
   * @intent a model that wraps its JSON in Markdown fences still parses
   */
  it('strips Markdown fences around the JSON payload', async () => {
    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content:
          '```json\n{"dimensionTags":[{"dimensionId":"ux","label":"体验","sentiment":"positive","quotes":["很快"]}],"emergentTags":[]}\n```',
      }),
    };

    const result = await generateReportWithDimensions(
      'test-fences',
      '测试',
      [{ question: '体验?', answer: '很快' }],
      null,
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.emergentTags).toEqual([]);
  });

  /**
   * @test REQ-SINGLE-001
   * @intent unparseable JSON degrades to no dimensions instead of throwing
   */
  it('returns empty dimensions when the model emits no JSON at all', async () => {
    const raw = '抱歉，我无法生成结构化结果。';
    const mockLLM = { chat: vi.fn().mockResolvedValue({ content: raw }) };

    const result = await generateReportWithDimensions(
      'test-garbage',
      '测试',
      [{ question: '你好', answer: '嗯' }],
      null,
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.dimensionTags).toEqual([]);
    expect(result.emergentTags).toEqual([]);
    // The raw answer is still kept: a model that answered in prose said something,
    // and the caller may want it. This is what separates "the JSON was unusable"
    // from "the call failed" -- the failure path returns empty content instead.
    expect(result.content).toBe(raw);
  });

  /**
   * @test REQ-SINGLE-001
   * @intent a JSON scalar (valid JSON, wrong shape) is treated as no dimensions
   */
  it('returns empty dimensions when the JSON is not an object', async () => {
    const mockLLM = { chat: vi.fn().mockResolvedValue({ content: '"just a string"' }) };

    const result = await generateReportWithDimensions(
      'test-scalar',
      '测试',
      [{ question: '你好', answer: '嗯' }],
      null,
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.dimensionTags).toEqual([]);
    expect(result.emergentTags).toEqual([]);
    expect(result.content).toBe('"just a string"');
  });

  /**
   * @test REQ-SINGLE-001
   * @intent a literal JSON `null` must not reach the field readers
   */
  it('returns empty dimensions when the JSON is null', async () => {
    // `typeof null` is 'object', so the object guard alone does NOT stop this:
    // without the explicit null check the field readers run against null and
    // throw a TypeError, which the outer catch turns into an EMPTY-CONTENT
    // report -- silently discarding a model answer that was actually received.
    const mockLLM = { chat: vi.fn().mockResolvedValue({ content: 'null' }) };

    const result = await generateReportWithDimensions(
      'test-null',
      '测试',
      [{ question: '你好', answer: '嗯' }],
      null,
      mockLLM as unknown as OpenAICompatibleLLM
    );

    expect(result.dimensionTags).toEqual([]);
    expect(result.emergentTags).toEqual([]);
    expect(result.content).toBe('null');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
