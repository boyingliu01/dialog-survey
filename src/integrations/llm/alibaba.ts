import { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';

const CHAT_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const EMBEDDINGS_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

export class AlibabaLLM implements LLMService {
  private apiKey: string;
  private model: string;

  constructor(options: LLMOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'qwen-turbo';
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.model,
          input: { messages: request.messages },
          parameters: {
            temperature: request.temperature || 0.7,
            max_tokens: request.max_tokens || 2000,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        output?: { text?: string; finish_reason?: string };
      };
      return {
        content: data.output?.text || '',
        finishReason: data.output?.finish_reason || 'stop',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('LLM API request timed out after 30s');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async embeddings(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-v3',
          input: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Embeddings API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        output?: { embeddings?: Array<{ embedding?: number[] }> };
      };
      return data.output?.embeddings?.[0]?.embedding || [];
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Embeddings API request timed out after 30s');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static fromEnv(): AlibabaLLM {
    return new AlibabaLLM({
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      model: 'qwen-turbo',
    });
  }
}
