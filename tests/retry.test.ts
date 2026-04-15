import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/utils/retry.js';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

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

    it('should throw error after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow(
        'always fails'
      );

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should use default options when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
    });

    it('should apply exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      });
      const elapsed = Date.now() - startTime;

      // Should wait at least 100ms + 200ms = 300ms
      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 500,
      });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThanOrEqual(1700);
    });

    it('should handle non-Error thrown values', async () => {
      const fn = vi.fn().mockRejectedValueOnce('string error').mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 1, initialDelayMs: 10 });

      expect(result).toBe('success');
    });

    it('should throw wrapped error for non-Error types', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(withRetry(fn, { maxRetries: 0, initialDelayMs: 10 })).rejects.toThrow(
        'string error'
      );
    });

    it('should work with custom maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(withRetry(fn, { maxRetries: 5, initialDelayMs: 10 })).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(6); // initial + 5 retries
    });

    it('should work with zero retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(withRetry(fn, { maxRetries: 0, initialDelayMs: 10 })).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(1); // only initial attempt
    });
  });
});
