# Integrations Layer — DingTalk + LLM Adapters

External service integrations for the interview robot.

## Where to Look

| Subdirectory | Files | Purpose |
|--------------|-------|---------|
| `dingtalk/` | `client.ts`, `stream-client.ts`, `message-sender.ts`, `token-manager.ts`, `middleware.ts` | DingTalk REST API + WebSocket streaming + OAuth token management |
| `llm/` | `base.ts`, `openai-compatible.ts`, `volcengine.ts`, `alibaba.ts` | OpenAI-compatible LLM clients with service-specific adapters |

## Conventions

**LLM Interface Contract**

All LLM clients implement the same OpenAI-compatible interface:
- Configured via environment variables: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`
- Service selection happens at runtime based on `LLM_BASE_URL`
- `openai-compatible.ts` is the default, supports doubao/minimax/glm/deepseek/kimi
- `volkengine.ts` is legacy (Ark API), `alibaba.ts` provides DashScope alternative

**DingTalk Authentication**

- `token-manager.ts` handles OAuth token caching and automatic refresh
- `middleware.ts` implements DingTalk signature verification for secure webhooks
- Stream mode uses WebSocket (not HTTP webhooks) via `stream-client.ts`

**Message Flow**

- Outbound: `message-sender.ts` → `stream-client.ts` → WebSocket
- Inbound: WebSocket → `middleware.ts` → route handlers

## Anti-Patterns

- Creating `new PrismaClient()` in integration clients (use DI via Fastify)
- Calling `prisma.interviewState` directly from integrations (route through repositories)
- Hardcoding token logic in clients (always use `TokenManager`)
- Bypassing `middleware.ts` signature verification on webhook handlers
- Mixing REST and Stream APIs in the same handler (keep concerns separate)
