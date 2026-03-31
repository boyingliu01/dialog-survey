# Services Layer - Agent Knowledge Base

**Domain**: External service integrations (LLM, ASR, DingTalk, Conversation)

## Overview

Service layer handles all external API integrations. Each service is isolated with its own types, provider, and barrel export.

## Structure

```
services/
├── llm/           # DashScope/Qwen provider
├── conversation/  # ConversationEngine orchestrator
├── dingtalk.ts    # DingTalk message adapter (parsing + sending)
├── asr/           # Fun-ASR voice transcription
├── stream/        # WebSocket stream handler
└── template.ts    # Template loader
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add LLM provider | `llm/dashscope-provider.ts` | Extend DashScopeProvider |
| Modify conversation flow | `conversation/engine.ts` | ConversationEngine class |
| DingTalk integration | `dingtalk.ts` | Message parsing + sending |
| WebSocket handling | `stream/handler.ts` | DingTalkStreamHandler |
| Voice transcription | `asr/index.ts` | AsrService |

## Conventions

- **Barrel exports**: Every sub-module has `index.ts`
- **Singleton pattern**: Module-level exports or static class methods
- **Error handling**: Always wrap external calls in `try/catch`
- **Types**: Separate `types.ts` in each sub-module

## Anti-Patterns (THIS PROJECT)

- Never call external APIs without error handling
- Never hardcode API endpoints - use env vars via `config.ts`
- Never bypass ConversationEngine for webhook → graph flow

## Key Patterns

### Adding a new service

```typescript
// 1. Create service directory with types.ts and index.ts
// 2. Define interface in types.ts
// 3. Implement provider class
// 4. Export via barrel (index.ts)
// 5. Add to services/index.ts
```

### LLM Provider Interface

```typescript
interface LLMProvider {
  chat(messages: Message[]): Promise<string>;
  generateResponse(prompt: string): Promise<string>;
}
```