import type { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';

const CHAT_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const EMBEDDINGS_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

/** The DashScope generation response body. */
interface ChatResponse {
  output?: { text?: string; finish_reason?: string };
}

/** The DashScope request body; note the `input`/`parameters` wrapper. */
function chatPayloadOf(request: LLMRequest, defaultModel: string): Record<string, unknown> {
  return {
    model: request.model || defaultModel,
    input: { messages: request.messages },
    parameters: {
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 2000,
    },
  };
}

/**
 * POST a generation request to DashScope.
 *
 * A non-2xx throws here rather than returning an error shape, because this client
 * has no retry classification of its own (unlike the OpenAI-compatible one): the
 * caller treats any throw as a failed call, and returning an empty string instead
 * would silently become an empty LLM reply.
 */
async function postChat(apiKey: string, payload: Record<string, unknown>): Promise<ChatResponse> {
  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
  return (await response.json()) as ChatResponse;
}

export class AlibabaLLM implements LLMService {
  private apiKey: string;
  private model: string;

  constructor(options: LLMOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'qwen-turbo';
  }

  // archlint-disable-next-line
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const data = await postChat(this.apiKey, chatPayloadOf(request, this.model));
    return {
      content: data.output?.text || '',
      finishReason: data.output?.finish_reason || 'stop',
    };
  }

  async embeddings(text: string): Promise<number[]> {
    const embeddingModel = process.env['DASHSCOPE_EMBEDDING_MODEL'] || 'text-embedding-v3';
    const response = await fetch(EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embeddings API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      output?: { embeddings?: Array<{ embedding?: number[] }> };
    };
    return data.output?.embeddings?.[0]?.embedding || [];
  }

  // archlint-disable-next-line
  static fromEnv(): AlibabaLLM {
    return new AlibabaLLM({
      apiKey: process.env['DASHSCOPE_API_KEY'] || '',
      model: process.env['DASHSCOPE_MODEL'] || 'qwen-turbo',
    });
  }
}
