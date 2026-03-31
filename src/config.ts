import { z } from 'zod';

// Environment variables validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url('Invalid database URL'),
  DASHSCOPE_API_KEY: z.string().min(1, 'DashScope API key is required'),
  MAX_LLM_RETRIES: z.coerce.number().default(2),
  LLM_TIMEOUT: z.coerce.number().default(30000),
  DINGTALK_APP_KEY: z.string().min(1, 'DingTalk App Key is required'),
  DINGTALK_APP_SECRET: z.string().min(1, 'DingTalk App Secret is required'),
  DINGTALK_AGENT_ID: z.string().min(1, 'DingTalk Agent ID is required'),
  PUBLIC_URL: z.string().url('Invalid public URL'),
  REPORTS_DIR: z.string().default('./reports'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  INTERNAL_API_KEY: z.string().min(1, 'Internal API key is required'),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

// Configuration object with type-safe access
export const config = {
  ...parsedEnv.data,
  // Derived properties
  corsOrigins: parsedEnv.data.CORS_ORIGINS.split(',').map(origin => origin.trim()),
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
};

// Type definitions for configuration
export type Config = typeof config;
