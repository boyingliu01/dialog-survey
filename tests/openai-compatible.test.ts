import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL,
  OpenAICompatibleLLM,
  normalizeLlmBaseUrl,
} from '../src/integrations/llm/openai-compatible.js';

describe('normalizeLlmBaseUrl (#189)', () => {
  it('should return empty string for undefined/empty input', () => {
    expect(normalizeLlmBaseUrl(undefined)).toBe('');
    expect(normalizeLlmBaseUrl('')).toBe('');
  });

  it('should leave a complete endpoint unchanged', () => {
    expect(normalizeLlmBaseUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });

  it('should strip a single trailing slash', () => {
    expect(normalizeLlmBaseUrl('https://api.example.com/v1/chat/completions/')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });

  it('should trim surrounding whitespace', () => {
    expect(normalizeLlmBaseUrl('  https://api.example.com/v1/chat/completions  ')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });

  it('should append /chat/completions to a bare base URL (the #189 fix)', () => {
    expect(normalizeLlmBaseUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
    expect(normalizeLlmBaseUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1/chat/completions'
    );
  });

  it('should not double-append when path already ends with /chat/completions', () => {
    const input = 'https://api.example.com/v1/chat/completions';
    expect(normalizeLlmBaseUrl(input)).toBe(input);
  });
});

describe('OpenAICompatibleLLM', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://test.api.com/v1/chat/completions';

  beforeEach(() => {
    vi.stubEnv('VOLCENGINE_API_KEY', mockApiKey);
    vi.stubEnv('VOLCENGINE_BASE_URL', mockBaseUrl);
    vi.stubEnv('VOLCENGINE_MODEL', 'test-model');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    /**
     * @test REQ-004-3-01
     * @intent 测试OpenAICompatibleLLM构造函数能否使用提供的选项创建实例，验证LLM适配器的基本初始化功能
     */
    it('should create instance with provided options', () => {
      const llm = new OpenAICompatibleLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
        model: 'custom-model',
      });

      expect(llm).toBeDefined();
    });

    /**
     * @test REQ-004-3-01
     * @intent 测试OpenAICompatibleLLM构造函数在未提供选项时使用默认值的能力，确保LLM适配器的容错性
     */
    it('should use default values when options not provided', () => {
      const llm = new OpenAICompatibleLLM({
        apiKey: mockApiKey,
      });

      expect(llm).toBeDefined();
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证DEFAULT_MODEL常量的值，确保LLM适配器使用正确的模型默认值
     */
    it('should use DEFAULT_MODEL constant', () => {
      expect(DEFAULT_MODEL).toBe('deepseek-v3.2');
    });
  });

  describe('fromEnv', () => {
    /**
     * @test REQ-004-3-01
     * @intent 验证OpenAICompatibleLLM.fromEnv方法能够成功从环境变量创建实例，测试LLM适配器的环境配置加载功能
     */
    it('should create instance from environment variables', () => {
      const llm = OpenAICompatibleLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证当API密钥未配置时，OpenAICompatibleLLM.fromEnv方法应该抛出适当错误，测试LLM适配器的配置验证机制
     */
    it('should throw error when API key not configured', () => {
      vi.stubEnv('LLM_API_KEY', '');
      vi.stubEnv('VOLCENGINE_API_KEY', '');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');

      expect(() => OpenAICompatibleLLM.fromEnv()).toThrow(
        'LLM_API_KEY or VOLCENGINE_API_KEY or ANTHROPIC_AUTH_TOKEN not configured'
      );
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证当VOLCENGINE_API_KEY为空时，系统可以使用ANTHROPIC_AUTH_TOKEN作为备用，测试LLM适配器的备选配置方案
     */
    it('should use ANTHROPIC_AUTH_TOKEN as fallback', () => {
      vi.stubEnv('LLM_API_KEY', '');
      vi.stubEnv('VOLCENGINE_API_KEY', '');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'anthropic-key');

      const llm = OpenAICompatibleLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证fromEnv方法能够正确使用环境中的模型配置，测试LLM适配器的模型设置功能
     */
    it('should use environment model when set', () => {
      vi.stubEnv('VOLCENGINE_MODEL', 'custom-model');

      const llm = OpenAICompatibleLLM.fromEnv();
      expect(llm).toBeDefined();
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证当VOLCENGINE_BASE_URL未设置时，系统使用默认baseUrl，测试LLM适配器的默认配置行为
     */
    it('should use default baseUrl when not set', () => {
      vi.stubEnv('VOLCENGINE_BASE_URL', '');

      const llm = OpenAICompatibleLLM.fromEnv();
      expect(llm).toBeDefined();
    });
  });

  describe('chat', () => {
    /**
     * @test REQ-004-3-01
     * @intent 验证OpenAICompatibleLLM chat方法能够成功发起API请求并返回正确结果，测试LLM适配器的聊天功能
     */
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

      const llm = new OpenAICompatibleLLM({
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

    /**
     * @test REQ-004-5-02
     * @intent 验证OpenAICompatibleLLM chat方法在API返回非ok状态时应抛出适当的错误，测试重试机制中的失败处理逻辑
     */
    it('should throw error when API returns non-ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const llm = new OpenAICompatibleLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(
        llm.chat({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('LLM API error: 500');
    });

    /**
     * @test REQ-004-3-01
     * @intent 验证chat方法能够使用自定义模型参数，测试LLM适配器的模型配置灵活性
     */
    it('should use custom model when provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'response' } }],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const llm = new OpenAICompatibleLLM({
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

    /**
     * @test REQ-004-3-01
     * @intent 验证chat方法能够使用自定义温度和最大令牌参数，测试LLM适配器的参数配置功能
     */
    it('should use custom temperature and max_tokens', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'response' } }],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const llm = new OpenAICompatibleLLM({
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

    /**
     * @test REQ-004-5-02
     * @intent 验证chat方法在回复缺少choices字段时能适当地处理，测试重试机制中对异常响应的容错能力
     */
    it('should handle missing choices in response', async () => {
      const mockResponse = {
        choices: [],
        usage: {},
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const llm = new OpenAICompatibleLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      const result = await llm.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('');
      expect(result.finishReason).toBe('stop');
    });

    /**
     * @test REQ-004-5-02
     * @intent 验证chat方法在消息内容缺失时能够适当地处理，测试重试机制中对异常响应的容错能力
     */
    it('should handle missing content in message', async () => {
      const mockResponse = {
        choices: [{ message: {} }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const llm = new OpenAICompatibleLLM({
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
      const llm = new OpenAICompatibleLLM({
        apiKey: mockApiKey,
        baseUrl: mockBaseUrl,
      });

      await expect(llm.embeddings('test text')).rejects.toThrow('Embeddings API not implemented');
    });
  });
});

/**
 * Error classification the retry layer consumes.
 *
 * `withRetry` decides from `statusCode`; the repository retry paths read
 * `retryable` directly. Both are part of the error's contract, and a wrong
 * classification is not a cosmetic bug: retrying a 401 burns the whole budget on
 * a request that can never succeed, while marking a timeout retryable makes the
 * user wait through the full window twice.
 */
/** The error `promise` rejects with, so tests can inspect it without a union type. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

describe('LLM error classification', () => {
  const client = () =>
    new OpenAICompatibleLLM({ apiKey: 'k', baseUrl: 'https://x/v1/chat/completions' });
  const respondWith = (status: number, body = 'boom') =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status,
      text: async () => body,
      json: async () => ({}),
    } as unknown as Response);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
  ])('status %i is retryable=%s', async (status, retryable) => {
    respondWith(status);
    const err = await rejectionOf(client().chat({ messages: [{ role: 'user', content: 'hi' }] }));
    expect((err as { statusCode?: number }).statusCode).toBe(status);
    expect((err as { retryable?: boolean }).retryable).toBe(retryable);
  });

  it('carries the response body into the message', async () => {
    respondWith(400, 'model not found');
    const err = await rejectionOf(client().chat({ messages: [{ role: 'user', content: 'hi' }] }));
    expect((err as Error).message).toContain('model not found');
  });

  it('treats a timeout as fatal, with status 408', async () => {
    // Not retryable: the request already consumed its whole window.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    vi.stubEnv('LLM_TIMEOUT', '5');
    try {
      const err = await rejectionOf(client().chat({ messages: [{ role: 'user', content: 'hi' }] }));
      expect((err as { statusCode?: number }).statusCode).toBe(408);
      expect((err as { retryable?: boolean }).retryable).toBe(false);
      expect((err as Error).message).toContain('timeout');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
