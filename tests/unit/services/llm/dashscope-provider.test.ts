import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashScopeProvider, resetDashScopeProvider, getDashScopeProvider, initializeDashScope } from '../../../../src/services/llm/dashscope-provider';

describe('DashScopeProvider', () => {
  beforeEach(() => {
    resetDashScopeProvider();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const provider = new DashScopeProvider({ apiKey: 'test-key' });
      expect(provider).toBeDefined();
    });

    it('should use default model qwen-max', () => {
      const provider = new DashScopeProvider({ apiKey: 'test-key' });
      // Access private property for testing
      expect((provider as any).model).toBe('qwen-max');
    });

    it('should use custom model when specified', () => {
      const provider = new DashScopeProvider({ 
        apiKey: 'test-key', 
        model: 'qwen-plus' 
      });
      expect((provider as any).model).toBe('qwen-plus');
    });

    it('should use default endpoint when not specified', () => {
      const provider = new DashScopeProvider({ apiKey: 'test-key' });
      expect((provider as any).endpoint).toContain('dashscope.aliyuncs.com');
    });
  });

  describe('chat', () => {
    it('should make POST request to DashScope API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });
      global.fetch = mockFetch;

      const provider = new DashScopeProvider({ apiKey: 'test-key' });
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      
      const result = await provider.chat(messages);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('Test response');
      expect(result.usage.totalTokens).toBe(15);
    });

    it('should include correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: {},
        }),
      });
      global.fetch = mockFetch;

      const provider = new DashScopeProvider({ apiKey: 'my-api-key' });
      await provider.chat([{ role: 'user', content: 'Test' }]);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers.Authorization).toBe('Bearer my-api-key');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should handle API errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });
      global.fetch = mockFetch;

      const provider = new DashScopeProvider({ apiKey: 'test-key' });
      
      await expect(provider.chat([{ role: 'user', content: 'Test' }]))
        .rejects.toThrow('DashScope API error: 401');
    });

    it.skip('should handle timeout', async () => {
      // Skip: fake timers with fetch is complex to test
      // The timeout logic is tested via integration tests
    });
  });
});

describe('DashScope singleton', () => {
  beforeEach(() => {
    resetDashScopeProvider();
  });

  it('should throw error when not initialized', () => {
    expect(() => getDashScopeProvider()).toThrow('not initialized');
  });

  it('should return same instance after initialization', () => {
    initializeDashScope({ apiKey: 'test-key' });
    const instance1 = getDashScopeProvider();
    const instance2 = getDashScopeProvider();
    expect(instance1).toBe(instance2);
  });

  it('should reset instance', () => {
    initializeDashScope({ apiKey: 'test-key' });
    resetDashScopeProvider();
    expect(() => getDashScopeProvider()).toThrow('not initialized');
  });
});