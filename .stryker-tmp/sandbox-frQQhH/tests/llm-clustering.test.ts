// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clusterDimensionQuotes, discoverEmergentIssues } from '../src/services/llm-clustering.js';

/** @test REQ-BATCH-003 @intent verify LLM clusters quotes into sub-themes @covers AC-BATCH-003-01 */
describe('LLM Topic Clustering', () => {
  /** @test REQ-BATCH-003 @intent verify returns 3-8 sub-themes from quotes @covers AC-BATCH-003-01 */
  it('returns 3-8 sub-themes per dimension', async () => {
    const quotes = [
      '每次升级都要重启3次',
      '升级过程中进度条卡住',
      '升级后回滚导致数据丢失',
      '产品偶尔会崩溃',
      '系统随机宕机',
      '内存占用越来越高',
      '界面太复杂',
      '新员工一周才上手',
    ];

    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify([
          {
            subTopicName: '升级不可靠',
            mentionCount: 3,
            overallSentiment: 'negative',
            representativeQuotes: ['每次升级都要重启3次'],
          },
          {
            subTopicName: '系统崩溃',
            mentionCount: 2,
            overallSentiment: 'negative',
            representativeQuotes: ['产品偶尔会崩溃'],
          },
          {
            subTopicName: '内存泄漏',
            mentionCount: 1,
            overallSentiment: 'negative',
            representativeQuotes: ['内存占用越来越高'],
          },
        ]),
      }),
    };

    const result = await clusterDimensionQuotes(quotes, '稳定性', mockLLM as any);

    expect(result).toHaveLength(3);
    expect(result[0].subTopicName).toBe('升级不可靠');
    expect(result[0].overallSentiment).toBe('negative');
  });

  /** @test REQ-BATCH-003 @intent verify returns empty array when no quotes @covers AC-BATCH-003-01 */
  it('returns empty array when no quotes provided', async () => {
    const mockLLM = { chat: vi.fn() };
    const result = await clusterDimensionQuotes([], '稳定性', mockLLM as any);
    expect(result).toHaveLength(0);
    expect(mockLLM.chat).not.toHaveBeenCalled();
  });

  /** @test REQ-BATCH-003 @intent verify returns fallback on LLM failure @covers AC-BATCH-003-01 */
  it('returns empty array when LLM fails', async () => {
    const quotes = ['some quote'];
    const mockLLM = { chat: vi.fn().mockRejectedValue(new Error('LLM error')) };
    const result = await clusterDimensionQuotes(quotes, '稳定性', mockLLM as any);
    expect(result).toEqual([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

/** @test REQ-BATCH-004 @intent verify LLM discovers emergent issues @covers AC-BATCH-004-01 */
describe('LLM Emergent Discovery', () => {
  /** @test REQ-BATCH-004 @intent verify returns up to 5 emergent issues @covers AC-BATCH-004-01 */
  it('returns up to top 5 emergent issues', async () => {
    const allEmergents = [
      '数据安全担忧',
      '移动端缺失',
      '文档不全',
      '升级失败',
      '性能下降',
      '界面卡顿',
      '客服响应慢',
    ];

    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify([
          {
            name: '数据安全担忧',
            mentionCount: 15,
            urgency: 'high',
            representativeQuotes: ['担心数据泄露'],
          },
          {
            name: '移动端缺失',
            mentionCount: 8,
            urgency: 'medium',
            representativeQuotes: ['没有手机app'],
          },
        ]),
      }),
    };

    const result = await discoverEmergentIssues(allEmergents, mockLLM as any);

    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0].name).toBe('数据安全担忧');
    expect(result[0].urgency).toBe('high');
  });

  /** @test REQ-BATCH-004 @intent verify returns empty when no emergents @covers AC-BATCH-004-01 */
  it('returns empty array when no emergent tags', async () => {
    const mockLLM = { chat: vi.fn() };
    const result = await discoverEmergentIssues([], mockLLM as any);
    expect(result).toEqual([]);
    expect(mockLLM.chat).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
