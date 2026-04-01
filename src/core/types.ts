import { z } from "zod";

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export type QuestionType = "rating" | "text" | "single_choice" | "yes_no";

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  follow_ups?: string[];
  condition?: string;
  options?: string[];
  ratingScale?: {
    min: number;
    max: number;
  };
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  initial_question: string;
}

export interface InterviewTemplate {
  id: string;
  name: string;
  description?: string;
  topics: Topic[];
  questions: Question[];
  domain_context?: string;
}

// Note: InterviewState is now defined in state.ts using LangGraph Annotation

export interface LLMResponse {
  content: string;
  isFollowupNeeded?: boolean;
  followupQuestion?: string;
}

export const LLMResponseSchema = z.object({
  content: z.string().min(1, "LLM response content cannot be empty"),
  isFollowupNeeded: z.boolean().optional().default(false),
  followupQuestion: z.string().optional(),
});

export function validateLLMResponse(data: unknown): LLMResponse {
  return LLMResponseSchema.parse(data);
}

export function safeValidateLLMResponse(data: unknown): LLMResponse | null {
  const result = LLMResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  return null;
}

export interface LLMProvider {
  generateResponse(prompt: string, history: Message[]): Promise<LLMResponse>;
}
