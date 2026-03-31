import { z } from "zod";

// Role enum for messages
export const MessageRoleSchema = z.enum(["system", "user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// Message schema and type (matching Python version - dict[str, str])
export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string().min(1, "Message content cannot be empty"),
});

export type Message = z.infer<typeof MessageSchema>;

// Topic schema and type (matching Python version)
export const TopicSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Topic name cannot be empty"),
  description: z.string().optional(),
});

export type Topic = z.infer<typeof TopicSchema>;

// Interview status enum (matching Python version)
export const InterviewStatusSchema = z.enum([
  "planning",
  "interviewing",
  "analyzing",
  "completed",
]);

export type InterviewStatus = z.infer<typeof InterviewStatusSchema>;

// Followup type enum (matching Python version: "clarification", "deep", "validation", "expansion")
export const FollowupTypeSchema = z.enum([
  "clarification",
  "deep",
  "validation",
  "expansion",
]);

export type FollowupType = z.infer<typeof FollowupTypeSchema>;

// Persona configuration
export const PersonaConfigSchema = z.record(z.string(), z.any());

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

// Interview state schema - using camelCase to match Prisma schema
export const InterviewStateSchema = z.object({
  // Session identifiers
  sessionId: z.string(),
  userId: z.string().min(1, "User ID cannot be empty"),
  templateId: z.string(),

  // Conversation state
  currentTopicIndex: z.number().int().min(0).default(0),
  conversationHistory: z.array(MessageSchema).default([]),
  extractedInfo: z.record(z.string(), z.any()).default({}),

  // Topic/content
  topics: z.array(TopicSchema).default([]),
  topic: z.string(), // Interview topic/title
  domainContext: z.string(), // Domain knowledge context

  // Flow control
  status: InterviewStatusSchema.default("planning"),

  // Follow-up tracking (FR-002 AC-003: max 2 follow-ups per topic)
  followupCount: z.record(z.string(), z.number().int()).default({}), // topic_id -> count of follow-ups asked

  // Pending actions
  pendingQuestion: z.string().nullable().default(null),
  needsFollowup: z.boolean().nullable().default(null),
  followupType: FollowupTypeSchema.nullable().default(null), // "clarification", "deep", "validation", "expansion"
  followupReason: z.string().nullable().default(null), // Reason for follow-up

  // Report
  report: z.string().nullable().default(null),
  reportPath: z.string().nullable().default(null),

  // Persona configuration
  personaConfig: PersonaConfigSchema.nullable().default(null), // Role, personality, style settings
});

export type InterviewState = z.infer<typeof InterviewStateSchema>;

// Question schema
export const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["rating", "text", "single_choice", "yes_no"]),
  text: z.string().min(1, "Question text cannot be empty"),
  followUps: z.array(z.string()).optional(),
  condition: z.string().optional(),
  options: z.array(z.string()).optional(),
  ratingScale: z.object({
    min: z.number().int().default(1),
    max: z.number().int().default(5),
  }).optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

// Template schema and type
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Template name cannot be empty"),
  description: z.string().optional(),
  topics: z.array(TopicSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  domainContext: z.string().optional(),
  created: z.date().optional(),
  updated: z.date().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;

// LLM message schema
export const LLMMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string().min(1, "LLM message content cannot be empty"),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;

// LLM response interface
export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// LLM options interface
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retries?: number;
}

// LLM provider interface
export interface LLMProvider {
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  stream?(
    messages: LLMMessage[],
    options?: LLMOptions
  ): AsyncIterableIterator<LLMResponse>;
}

// DingTalk message types
export interface DingTalkMessage {
  msgId: string;
  senderUserId: string;
  senderNick: string;
  conversationId: string;
  messageType: string;
  content?: string;
  voiceUrl?: string;
  timestamp: number;
}

// API response types
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

// Environment configuration
export const EnvironmentVariablesSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  DINGTALK_APP_KEY: z.string().min(1, 'DingTalk App Key is required'),
  DINGTALK_APP_SECRET: z.string().min(1, 'DingTalk App Secret is required'),
  DINGTALK_AGENT_ID: z.string().min(1, 'DingTalk Agent ID is required'),
  LLM_API_KEY: z.string().min(1, 'LLM API Key is required'),
  LLM_ENDPOINT: z.string().min(1, 'LLM Endpoint is required'),
  LLM_MODEL: z.string().default('gpt-3.5-turbo'),
});

export type EnvironmentVariables = z.infer<typeof EnvironmentVariablesSchema>;

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  dingtalkAppKey: string;
  dingtalkAppSecret: string;
  dingtalkAgentId: string;
  llmApiKey: string;
  llmEndpoint: string;
  llmModel: string;
}
