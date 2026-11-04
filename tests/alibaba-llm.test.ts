/**
 * @test REQ-LLM-ALIBABA
 * @intent The Alibaba / DashScope adapter was 0% mutation-scored: the only test
 *   referencing it asserted `fs.existsSync('src/integrations/llm/alibaba.ts')`,
 *   so the class was never instantiated and every mutant survived. This drives
 *   the real class instead, covering the DashScope payload wrapper, the two
 *   non-2xx paths, and the fallbacks that keep a missing field from becoming an
 *   empty LLM reply.
 * @covers src/integrations/llm/alibaba.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlibabaLLM } from '../src/integrations/llm/alibaba.js';

const CHAT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const EMBEDDINGS_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

/** Capture the request body sent to a mocked fetch. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('AlibabaLLM', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('defaults the model to qwen-turbo when none is given', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'hi' } }));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.model).toBe('qwen-turbo');
    });

    it('uses the provided model when given one', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'hi' } }));
      const llm = new AlibabaLLM({ apiKey: 'k', model: 'qwen-max' });

      await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.model).toBe('qwen-max');
    });
  });

  describe('chat', () => {
    it('wraps messages in the DashScope input/parameters envelope', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'answer' } }));
      const llm = new AlibabaLLM({ apiKey: 'k' });
      const messages = [{ role: 'user' as const, content: 'hello' }];

      await llm.chat({ messages });

      expect(mockFetch).toHaveBeenCalledWith(CHAT_URL, expect.objectContaining({ method: 'POST' }));
      const init = mockFetch.mock.calls[0][1];
      expect(init.headers.Authorization).toBe('Bearer k');
      const body = JSON.parse(init.body as string);
      // DashScope nests the conversation under `input.messages`, NOT top-level.
      expect(body.input).toEqual({ messages });
      expect(body.messages).toBeUndefined();
    });

    it('applies the default temperature and max_tokens', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'a' } }));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.parameters).toEqual({ temperature: 0.7, max_tokens: 2000 });
    });

    it('passes explicit temperature and max_tokens through', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'a' } }));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await llm.chat({
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0.1,
        max_tokens: 50,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.parameters).toEqual({ temperature: 0.1, max_tokens: 50 });
    });

    it('returns the response text and finish reason', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ output: { text: 'the answer', finish_reason: 'length' } })
      );
      const llm = new AlibabaLLM({ apiKey: 'k' });

      const result = await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      expect(result.content).toBe('the answer');
      expect(result.finishReason).toBe('length');
    });

    it('falls back to an empty string and "stop" when output is missing', async () => {
      // An absent output must degrade to a value the caller can recognise as
      // empty -- not to the literal string "undefined".
      mockFetch.mockResolvedValue(jsonResponse({}));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      const result = await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      expect(result.content).toBe('');
      expect(result.finishReason).toBe('stop');
    });

    it('throws on a non-2xx response instead of returning empty content', async () => {
      // Discussed in the source: silently returning '' would become an empty LLM
      // reply, so a failure must surface as a throw.
      mockFetch.mockResolvedValue(jsonResponse({}, false, 401));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await expect(llm.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
        'LLM API error: 401'
      );
    });
  });

  describe('embeddings', () => {
    it('posts the text and returns the first embedding vector', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ output: { embeddings: [{ embedding: [0.1, 0.2, 0.3] }] } })
      );
      const llm = new AlibabaLLM({ apiKey: 'k' });

      const vector = await llm.embeddings('some text');

      expect(vector).toEqual([0.1, 0.2, 0.3]);
      expect(mockFetch).toHaveBeenCalledWith(
        EMBEDDINGS_URL,
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.input).toBe('some text');
      expect(body.model).toBe('text-embedding-v3');
    });

    it('honours DASHSCOPE_EMBEDDING_MODEL', async () => {
      vi.stubEnv('DASHSCOPE_EMBEDDING_MODEL', 'text-embedding-v2');
      mockFetch.mockResolvedValue(jsonResponse({ output: { embeddings: [{ embedding: [1] }] } }));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await llm.embeddings('t');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.model).toBe('text-embedding-v2');
    });

    it('returns an empty array when the payload carries no embedding', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ output: {} }));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      expect(await llm.embeddings('t')).toEqual([]);
    });

    it('throws on a non-2xx response', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, false, 500));
      const llm = new AlibabaLLM({ apiKey: 'k' });

      await expect(llm.embeddings('t')).rejects.toThrow('Embeddings API error: 500');
    });
  });

  describe('fromEnv', () => {
    it('reads the key and model from the environment', async () => {
      vi.stubEnv('DASHSCOPE_API_KEY', 'env-key');
      vi.stubEnv('DASHSCOPE_MODEL', 'qwen-plus');
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'x' } }));

      const llm = AlibabaLLM.fromEnv();
      await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      const init = mockFetch.mock.calls[0][1];
      expect(init.headers.Authorization).toBe('Bearer env-key');
      expect(JSON.parse(init.body as string).model).toBe('qwen-plus');
    });

    it('falls back to an empty key and qwen-turbo when the env is unset', async () => {
      vi.stubEnv('DASHSCOPE_API_KEY', '');
      vi.stubEnv('DASHSCOPE_MODEL', '');
      mockFetch.mockResolvedValue(jsonResponse({ output: { text: 'x' } }));

      const llm = AlibabaLLM.fromEnv();
      await llm.chat({ messages: [{ role: 'user', content: 'x' }] });

      const init = mockFetch.mock.calls[0][1];
      expect(init.headers.Authorization).toBe('Bearer ');
      expect(JSON.parse(init.body as string).model).toBe('qwen-turbo');
    });
  });
});
