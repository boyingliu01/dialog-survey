import { z } from 'zod';

// Environment variables validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  DASHSCOPE_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_ENDPOINT: z.string().optional(),
  MAX_LLM_RETRIES: z.coerce.number().default(2),
  LLM_TIMEOUT: z.coerce.number().default(30000),
  DINGTALK_APP_KEY: z.string().optional(),
  DINGTALK_APP_SECRET: z.string().optional(),
  DINGTALK_AGENT_ID: z.string().optional(),
  PUBLIC_URL: z.string().optional(),
  REPORTS_DIR: z.string().default('./reports'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  INTERNAL_API_KEY: z.string().optional(),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

// In test environment or when validation fails, use defaults
const isTest = process.env.NODE_ENV === 'test';

if (!parsedEnv.success && !isTest) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

// Default values for test environment
const getTestDefaults = () => ({
  NODE_ENV: 'test' as const,
  PORT: 3000,
  HOST: '0.0.0.0',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DASHSCOPE_API_KEY: 'test-dashscope-api-key',
  LLM_API_KEY: 'test-llm-api-key',
  LLM_MODEL: 'test-model',
  LLM_ENDPOINT: 'https://test.endpoint',
  MAX_LLM_RETRIES: 2,
  LLM_TIMEOUT: 30000,
  DINGTALK_APP_KEY: 'test-app-key',
  DINGTALK_APP_SECRET: 'test-app-secret',
  DINGTALK_AGENT_ID: 'test-agent-id',
  PUBLIC_URL: 'http://localhost:3000',
  REPORTS_DIR: './reports',
  LOG_LEVEL: 'info' as const,
  CORS_ORIGINS: '*',
  INTERNAL_API_KEY: 'test-internal-api-key',
});

// Configuration object with type-safe access
// In test mode, use defaults for missing values
const envData = parsedEnv.success 
  ? { ...getTestDefaults(), ...parsedEnv.data }
  : getTestDefaults();

export const config = {
  ...envData,
  // Derived properties
  corsOrigins: envData.CORS_ORIGINS.split(',').map(origin => origin.trim()),
  isDevelopment: envData.NODE_ENV === 'development',
  isProduction: envData.NODE_ENV === 'production',
  isTest: envData.NODE_ENV === 'test',
};

// Type definitions for configuration
export type Config = typeof config;
