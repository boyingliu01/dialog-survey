import type { LLMProvider, LLMResponse, LLMMessage, LLMOptions } from '../../types';
import type { LLMResponse as CoreLLMResponse } from '../../core/types';

/**
 * DashScope (Qwen) LLM Provider configuration
 */
export interface DashScopeConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
}

/**
 * DashScope (Qwen) LLM Provider
 * Implements LLMProvider interface for Alibaba Cloud's Qwen models
 * using the OpenAI-compatible API endpoint
 */
export class DashScopeProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: DashScopeConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'qwen-max';
    this.endpoint = config.endpoint ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  }

  /**
   * Send chat request to DashScope API
   */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutMs = (options?.timeout ?? 30) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DashScope API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      
      return {
        content: data.choices?.[0]?.message?.content ?? '',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`DashScope API timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Stream chat response from DashScope API
   */
  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions
  ): AsyncIterableIterator<LLMResponse> {
    const controller = new AbortController();
    const timeoutMs = (options?.timeout ?? 60) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DashScope API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content ?? '';
              if (content) {
                yield {
                  content,
                  usage: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                  },
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate response with prompt and history (for compatibility with core LLMProvider)
   * This wraps the chat method for compatibility with the graph nodes
   */
  async generateResponse(prompt: string, history: Array<{ role: string; content: string }>): Promise<CoreLLMResponse> {
    const messages: LLMMessage[] = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
      { role: 'user', content: prompt },
    ];

    const response = await this.chat(messages);
    
    return {
      content: response.content,
      isFollowupNeeded: false,
    };
  }
}

// Singleton instance
let dashScopeInstance: DashScopeProvider | null = null;

/**
 * Get or create DashScope provider instance
 */
export function getDashScopeProvider(config?: DashScopeConfig): DashScopeProvider {
  if (!dashScopeInstance && config) {
    dashScopeInstance = new DashScopeProvider(config);
  }
  if (!dashScopeInstance) {
    throw new Error('DashScope provider not initialized. Call getDashScopeProvider with config first.');
  }
  return dashScopeInstance;
}

/**
 * Initialize DashScope provider
 */
export function initializeDashScope(config: DashScopeConfig): DashScopeProvider {
  dashScopeInstance = new DashScopeProvider(config);
  return dashScopeInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetDashScopeProvider(): void {
  dashScopeInstance = null;
}