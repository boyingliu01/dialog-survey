import { z } from 'zod';
import 'dotenv/config';

// Environment variables validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DINGTALK_APP_KEY: z.string().default(''),
  DINGTALK_APP_SECRET: z.string().default(''),
  DINGTALK_AGENT_ID: z.string().default(''),
  REPORTS_DIR: z.string().default('./reports'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  INTERNAL_API_KEY: z.string().default('test-api-key'),
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
  corsOrigins: parsedEnv.data.CORS_ORIGINS.split(',').map((origin: string) => origin.trim()),
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
};

export type Config = typeof config;
