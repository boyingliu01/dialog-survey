import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VolcengineLLM, DEFAULT_MODEL } from '../src/integrations/llm/volcengine.js';

describe('VolcengineLLM', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://test.api.com';

  beforeEach(() => {
    vi.stubEnv('VOLCENGINE_API_KEY', mockApiKey);
    vi.stubEnv('VOLCENGINE_BASE_URL', mockBaseUrl);
    vi.stubEnv('VOLCENGINE_MODEL', 'test-model');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should create instance with provided options', () => {
      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
        model: 'custom-model',
      });

      expect(llm).toBeDefined();
    });

    it('should use default values when options not provided', () => {
      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
      });

      expect(llm).toBeDefined();
    });

    it('should use DEFAULT_MODEL constant', () => {
      expect(DEFAULT_MODEL).toBe('deepseek-v3.2');
    });
  });

  describe('fromEnv', () => {
    it('should create instance from environment variables', () => {
      const llm = VolcengineLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    it('should throw error when API key not configured', () => {
      vi.stubEnv('VOLCENGINE_API_KEY', '');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');

      expect(() => VolcengineLLM.fromEnv()).toThrow(
        'VOLCENGINE_API_KEY or ANTHROPIC_AUTH_TOKEN not configured'
      );
    });

    it('should use ANTHROPIC_AUTH_TOKEN as fallback', () => {
      vi.stubEnv('VOLCENGINE_API_KEY', '');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'anthropic-key');

      const llm = VolcengineLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    it('should use environment model when set', () => {
      vi.stubEnv('VOLCENGINE_MODEL', 'custom-model');

      const llm = VolcengineLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    it('should use default baseUrl when not set', () => {
      vi.stubEnv('VOLCENGINE_BASE_URL', '');

      const llm = VolcengineLLM.fromEnv();
      expect(llm).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should make successful API request', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Hello, this is a test response' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      const result = await llm.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, this is a test response');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(20);
    });

    it('should throw error when API returns non-ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(
        llm.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('Volcengine LLM API error: 500');
    });

    it('should use custom model when provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'response' } }],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await llm.chat({
        model: 'custom-model',
        messages: [{ role: 'user', content: 'test' }],
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.model).toBe('custom-model');
    });

    it('should use custom temperature and max_tokens', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'response' } }],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await llm.chat({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.5,
        max_tokens: 1000,
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(1000);
    });

    it('should handle missing choices in response', async () => {
      const mockResponse = {
        choices: [],
        usage: {},
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      const result = await llm.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('');
      expect(result.finishReason).toBe('stop');
    });

    it('should handle missing content in message', async () => {
      const mockResponse = {
        choices: [{ message: {} }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      const result = await llm.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('');
    });
  });

  describe('embeddings', () => {
    it('should throw not implemented error', async () => {
      const llm = new VolcengineLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(llm.embeddings('test text')).rejects.toThrow(
        'Embeddings API not implemented for Volcengine'
      );
    });
  });
});
