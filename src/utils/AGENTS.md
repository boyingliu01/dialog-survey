# src/utils/ — Utility Functions

## Overview
Core utilities for logging, security, retry logic, Markdown rendering, PII handling, and database access.

## Where to Look

| File | Purpose | Key Symbols |
|------|---------|-------------|
| `logger.ts` | Pino wrapper | `info`, `error`, `warn` |
| `security.ts` | Middleware factory | `createVerifyApiKey`, `securityMiddleware` |
| `retry.ts` | Exponential backoff | `withRetry` |
| `markdown.ts` | XSS-safe renderer | `renderMarkdown` |
| `pii-anonymizer.ts` | Phone masking | `maskPhone` |
| `db.ts` | DB singleton | `getDb`, `injectDb` |

## Conventions

- **No console**: All logging goes through `logger.ts`. Biome enforces `noConsole: error`.
- **Retry pattern**: `withRetry(fn, maxAttempts)` wraps async operations. Default `MAX_RETRIES=2`.
- **Security middleware**: `securityMiddleware(app)` sets up Prisma client, CORS, helmet in one call.
- **PII handling**: `maskPhone()` uses partial masking (last 4 digits visible).
- **Database DI**: `getDb()` returns singleton. Use `injectDb(fastify)` for dependency injection via Fastify register opts.

## Anti-Patterns

- **Direct PrismaClient**: Never `new PrismaClient()` in utils. Use DI via `getDb()` or Fastify injection.
- **console.log**: Forbidden. Use `logger.info/error/warn` instead.
- **Raw markdown**: Never render unsanitized Markdown. Always use `renderMarkdown()` for XSS safety.
- **Hard-coded retries**: Don't inline retry logic. Use `withRetry()` wrapper for consistency.
