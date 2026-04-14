export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  content: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMService {
  chat(request: LLMRequest): Promise<LLMResponse>;
  embeddings(text: string): Promise<number[]>;
}

export interface LLMOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}
