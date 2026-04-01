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

export interface LLMResponse {
  content: string;
  isFollowupNeeded?: boolean;
  followupQuestion?: string;
}

const DANGEROUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+(in\s+)?developer\s+mode/i,
  /system\s+override/i,
  /reveal\s+(system\s+)?prompt/i,
];

function sanitizeContent(content: string): string {
  let sanitized = content;
  DANGEROUS_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  });
  return sanitized.replace(/\s+/g, " ").trim();
}

export const LLMResponseSchema = z.object({
  content: z.string().min(1).max(10000).transform(sanitizeContent),
  isFollowupNeeded: z.boolean().optional().default(false),
  followupQuestion: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v ? sanitizeContent(v) : v)),
});

export function validateLLMResponse(data: unknown): LLMResponse {
  return LLMResponseSchema.parse(data);
}

export function safeValidateLLMResponse(data: unknown): LLMResponse | null {
  const result = LLMResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}

export interface LLMProvider {
  generateResponse(prompt: string, history: Message[]): Promise<LLMResponse>;
}
