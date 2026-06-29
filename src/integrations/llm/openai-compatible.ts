import { error, info } from '../../utils/logger.js';
import { RetryError } from '../../utils/retry.js';
import { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';

// 支持的模型列表：doubao-seed-2.0-code, doubao-seed-2.0-pro, doubao-seed-2.0-lite,
// doubao-seed-code, minimax-m2.5, glm-4.7, deepseek-v3.2, kimi-k2.5
export const DEFAULT_MODEL = 'deepseek-v3.2';

export class OpenAICompatibleLLM implements LLMService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: LLMOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl || 'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions';
    this.model = options.model || DEFAULT_MODEL;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const url = this.baseUrl;

    info('LLM request', {
      model: request.model || this.model,
      messageCount: request.messages.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      error('LLM API error', { status: response.status, body: errText });
      throw new RetryError(
        `LLM API error: ${response.status} - ${errText}`,
        response.status,
        response.status >= 500 || response.status === 429
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    const finishReason = choice?.finish_reason || 'stop';

    info('LLM response', {
      contentLength: content.length,
      finishReason,
      usage: data.usage,
    });

    return {
      content,
      finishReason,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  async embeddings(_text: string): Promise<number[]> {
    error('Embeddings not implemented yet');
    throw new Error('Embeddings API not implemented');
  }

  static fromEnv(): OpenAICompatibleLLM {
    const apiKey =
      process.env['LLM_API_KEY'] ||
      process.env['VOLCENGINE_API_KEY'] ||
      process.env['ANTHROPIC_AUTH_TOKEN'] ||
      '';
    const baseUrl =
      process.env['LLM_BASE_URL'] ||
      process.env['VOLCENGINE_BASE_URL'] ||
      'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions';
    const model = process.env['LLM_MODEL'] || process.env['VOLCENGINE_MODEL'] || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error('LLM_API_KEY or VOLCENGINE_API_KEY or ANTHROPIC_AUTH_TOKEN not configured');
    }

    return new OpenAICompatibleLLM({
      apiKey,
      baseUrl,
      model,
    });
  }
}
