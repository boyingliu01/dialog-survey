import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DingTalkStreamHandler } from '../../../../src/services/stream/handler';
import { StreamConfig } from '../../../../src/services/stream/types';

describe('DingTalkStreamHandler', () => {
  const mockConfig: StreamConfig = {
    appKey: 'testAppKey',
    appSecret: 'testAppSecret',
    agentId: 'testAgentId',
    token: 'testToken',
    aesKey: 'testAesKey',
  };

  describe('message deduplication', () => {
    it('should detect duplicate messages', () => {
      const handler = new DingTalkStreamHandler(mockConfig);

      // @ts-expect-error Accessing private method
      const isDuplicate1 = handler['isDuplicateMessage']('msg1');
      // @ts-expect-error Accessing private method
      const isDuplicate2 = handler['isDuplicateMessage']('msg1');

      expect(isDuplicate1).toBe(false);
      expect(isDuplicate2).toBe(true);
    });

    it('should clear expired messages from cache', () => {
      const handler = new DingTalkStreamHandler({
        ...mockConfig,
        messageCacheTTL: 100, // 100ms TTL
      });

      // @ts-expect-error Accessing private method
      handler['isDuplicateMessage']('expiringMsg');

      vi.useFakeTimers();
      vi.advanceTimersByTime(200);

      // @ts-expect-error Accessing private method
      const isDuplicate = handler['isDuplicateMessage']('expiringMsg');

      expect(isDuplicate).toBe(false);

      vi.useRealTimers();
    });

    it('should limit cache size', () => {
      const cacheSize = 5;
      const handler = new DingTalkStreamHandler({
        ...mockConfig,
        messageCacheSize: cacheSize,
      });

      // Add more messages than cache size
      for (let i = 0; i <= cacheSize; i++) {
        // @ts-expect-error Accessing private method
        handler['isDuplicateMessage'](`msg${i}`);
      }

      // @ts-expect-error Accessing private property
      const cacheSizeResult = handler['messageCache'].size;

      expect(cacheSizeResult).toBe(cacheSize);
    });
  });

  describe('configuration', () => {
    it('should use default configuration if not provided', () => {
      const handler = new DingTalkStreamHandler({
        appKey: 'test',
        appSecret: 'test',
        agentId: 'test',
      });

      // @ts-expect-error Accessing private property
      expect(handler['config']).toEqual(
        expect.objectContaining({
          reconnectInterval: 5000,
          maxReconnectAttempts: Infinity,
          messageCacheSize: 1000,
          messageCacheTTL: 60000,
        })
      );
    });

    it('should respect custom configuration', () => {
      const customConfig: StreamConfig = {
        appKey: 'test',
        appSecret: 'test',
        agentId: 'test',
        token: 'testToken',
        aesKey: 'testAesKey',
        reconnectInterval: 10000,
        maxReconnectAttempts: 10,
        messageCacheSize: 500,
        messageCacheTTL: 30000,
      };

      const handler = new DingTalkStreamHandler(customConfig);

      // @ts-expect-error Accessing private property
      expect(handler['config']).toEqual(customConfig);
    });
  });

  describe('event management', () => {
    it('should register and trigger listeners', () => {
      const handler = new DingTalkStreamHandler(mockConfig);
      const listener = vi.fn();

      handler.on(listener);

      // @ts-expect-error Accessing private method
      handler['emit']('connect');
      // @ts-expect-error Accessing private method
      handler['emit']('message', 'testData');

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith('connect');
      expect(listener).toHaveBeenCalledWith('message', 'testData');
    });

    it('should remove event listener', () => {
      const handler = new DingTalkStreamHandler(mockConfig);
      const listener = vi.fn();

      handler.on(listener);
      handler.off(listener);

      // @ts-expect-error Accessing private method
      handler['emit']('connect');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
