import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/utils/retry.js';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry在首次尝试成功时返回结果，确保重试机制在正常情况下不干扰函数执行
     */
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry在失败时重试并最终成功，确保重试机制能够在临时性错误后恢复正常
     */
    it('should retry on failure and succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    /**
     * @test REQ-004-5-02
     * @intent 验证withRetry在达到最大重试次数后抛出错误，确保重试机制有合理限制避免无限制重试
     */
    it('should throw error after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow(
        'always fails'
      );

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry使用默认选项，确保重试工具在没有显式配置的情况下仍能正常工作
     */
    it('should use default options when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry应用指数退避算法，确保重试机制在连续失败时采用合适的间隔策略
     */
    it('should apply exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 5,
        backoffMultiplier: 2,
        maxDelayMs: 100,
      });
      const elapsed = Date.now() - startTime;

      // Should wait at least 5ms + 10ms = 15ms
      expect(elapsed).toBeGreaterThanOrEqual(12);
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry在退避延迟中应用最大延迟限制，防止重试等待时间过长
     */
    it('should cap delay at maxDelayMs', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 20,
        backoffMultiplier: 10,
        maxDelayMs: 10,
      });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThanOrEqual(80);
    });

    /**
     * @test REQ-004-5-02
     * @intent 验证withRetry处理非Error类型抛出的值，确保重试机制能够处理各种类型的错误
     */
    it('should handle non-Error thrown values', async () => {
      const fn = vi.fn().mockRejectedValueOnce('string error').mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 1, initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    /**
     * @test REQ-004-5-02
     * @intent 验证withRetry对非Error类型抛出错误进行包装，确保错误处理的一致性
     */
    it('should throw wrapped error for non-Error types', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(withRetry(fn, { maxRetries: 0, initialDelayMs: 10 })).rejects.toThrow(
        'string error'
      );
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry在自定义重试次数下的行为，确保可配置的重试参数按预期工作
     */
    it('should work with custom maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(withRetry(fn, { maxRetries: 5, initialDelayMs: 10 })).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(6); // initial + 5 retries
    });

    /**
     * @test REQ-004-5-01
     * @intent 验证withRetry在零次重试下的行为，确保重试机制能够接受零重试设置
     */
    it('should work with zero retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(withRetry(fn, { maxRetries: 0, initialDelayMs: 10 })).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(1); // only initial attempt
    });
  });
});
