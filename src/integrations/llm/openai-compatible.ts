import { error, info } from '../../utils/logger.js';
import { RetryError } from '../../utils/retry.js';
import type { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';

// 支持的模型列表：doubao-seed-2.0-code, doubao-seed-2.0-pro, doubao-seed-2.0-lite,
// doubao-seed-code, minimax-m2.5, glm-4.7, deepseek-v3.2, kimi-k2.5
export const DEFAULT_MODEL = 'deepseek-v3.2';

const CHAT_COMPLETIONS_SUFFIX = '/chat/completions';

/**
 * Environment variables that may hold the API key, in precedence order.
 *
 * Several names because this client is deployed against a Volcengine gateway and
 * against plain OpenAI-compatible endpoints, and an operator should not have to
 * rename the variable they already have set. The first non-empty value wins; an
 * empty string counts as unset, which is how a compose file with `KEY=` behaves.
 */
const API_KEY_VARS = ['LLM_API_KEY', 'VOLCENGINE_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

/** Base-URL variables, in precedence order. */
const BASE_URL_VARS = ['LLM_BASE_URL', 'VOLCENGINE_BASE_URL'] as const;

/** Model variables, in precedence order; `DEFAULT_MODEL` is the fallback. */
const MODEL_VARS = ['LLM_MODEL', 'VOLCENGINE_MODEL'] as const;

/** The first non-empty value among `names`, or `fallback` when none is set. */
function firstEnv(names: readonly string[], fallback: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return fallback;
}

/** The JSON body sent to the completions endpoint. */
function payloadOf(request: LLMRequest, defaultModel: string): Record<string, unknown> {
  return {
    model: request.model || defaultModel,
    messages: request.messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 2000,
  };
}

/**
 * Turn a non-2xx response into the error the retry layer decides on.
 *
 * The third argument is `RetryError`'s "worth retrying" flag, and it is the whole
 * point of this function: a 5xx or a 429 is the gateway being busy and WILL be
 * retried, while a 400/401/403 is the request being wrong, and retrying that just
 * burns the budget and hides the misconfiguration. `error()` is called first so
 * the full body is on record -- the thrown message carries it too, but the log is
 * what an operator actually reads.
 */
async function apiError(response: Response): Promise<RetryError> {
  const errText = await response.text();
  error('LLM API error', { status: response.status, body: errText });
  const retryable = response.status >= 500 || response.status === 429;
  return new RetryError(
    `LLM API error: ${response.status} - ${errText}`,
    response.status,
    retryable
  );
}

/**
 * Translate an abort into the timeout error the caller expects, passing anything
 * else through untouched.
 *
 * A timeout is NOT retryable: the request already had its full window, so a retry
 * only doubles how long the user waits. Every other error keeps its own retry
 * classification.
 */
function asTimeoutOrRethrow(e: unknown, timeoutMs: number, model: string): unknown {
  if (e instanceof DOMException && e.name === 'AbortError') {
    error('LLM request timeout', { timeoutMs, model });
    return new RetryError(`LLM request timeout after ${timeoutMs}ms`, 408, false);
  }
  return e;
}

/**
 * Normalize an LLM base URL into a COMPLETE chat completions endpoint.
 *
 * Both the client (chat()) and the /health probe fetch() the URL directly as
 * the request target, so it must be the full endpoint (…/v1/chat/completions),
 * not a gateway base (…/v1). Historically README and the CLI suggested the base
 * form, which produced a permanent HTTP 404 at /health and on every LLM call
 * (issue #189).
 *
 * Rules:
 *   - empty input is returned unchanged (constructor falls back to the default)
 *   - surrounding whitespace is trimmed
 *   - a single trailing slash is stripped
 *   - if the path does not already end with /chat/completions, it is appended
 */
export function normalizeLlmBaseUrl(raw: string | undefined): string {
  if (!raw) return raw ?? '';
  let url = raw.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  if (!url.toLowerCase().endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    url = `${url}${CHAT_COMPLETIONS_SUFFIX}`;
  }
  return url;
}

export class OpenAICompatibleLLM implements LLMService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: LLMOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl =
      normalizeLlmBaseUrl(options.baseUrl) ||
      'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions';
    this.model = options.model || DEFAULT_MODEL;
  }

  /** Post the chat request, converting non-2xx into a `RetryError`. */
  private async postChatCompletion(
    request: LLMRequest,
    signal: AbortSignal
  ): Promise<{
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloadOf(request, this.model)),
      signal,
    });

    if (!response.ok) throw await apiError(response);

    return (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.model;
    const timeoutMs = Number.parseInt(process.env['LLM_TIMEOUT'] || '120000', 10);

    info('LLM request', {
      model,
      messageCount: request.messages.length,
      timeoutMs,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const data = await this.postChatCompletion(request, controller.signal);
      clearTimeout(timeoutId);
      return this.toResponse(data);
    } catch (e) {
      clearTimeout(timeoutId);
      throw asTimeoutOrRethrow(e, timeoutMs, model);
    }
  }

  /** Map a successful completion payload onto the public `LLMResponse` shape. */
  private toResponse(data: {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }): LLMResponse {
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
    const apiKey = firstEnv(API_KEY_VARS, '');
    if (!apiKey) {
      throw new Error(`${API_KEY_VARS.join(' or ')} not configured`);
    }

    const rawBaseUrl = firstEnv(
      BASE_URL_VARS,
      'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions'
    );
    const baseUrl = normalizeLlmBaseUrl(rawBaseUrl);
    if (baseUrl !== rawBaseUrl) {
      info('LLM_BASE_URL normalized', { from: rawBaseUrl, to: baseUrl });
    }

    return new OpenAICompatibleLLM({
      apiKey,
      baseUrl,
      model: firstEnv(MODEL_VARS, DEFAULT_MODEL),
    });
  }
}
