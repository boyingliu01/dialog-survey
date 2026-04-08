# AGENTS.md: tests/

**OVERVIEW**: Test suite using Vitest with globals enabled, enforcing 80% coverage across lines, functions, branches, and statements.

## STRUCTURE

```
tests/
├── unit/           # 20 files - Unit tests mirroring src/ structure
├── integration/    # 4 files - Fastify route tests with buildServer()
└── e2e/           # Empty (reserved)
```

## WHERE TO LOOK

| File                       | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `tests/unit/core/`         | LangGraph state, nodes, edges, prompts, graph tests |
| `tests/unit/services/`     | LLM provider, DingTalk, ASR, template loading tests |
| `tests/unit/repositories/` | Prisma repository tests with mocked db module       |
| `tests/integration/api/`   | Webhook, templates, interviews endpoint tests       |
| `vitest.config.ts`         | Global test configuration and coverage thresholds   |

## CONVENTIONS

**Vitest Setup**

- `globals: true` - Use `describe`, `it`, `expect` without imports
- Coverage thresholds: 80% for lines, functions, branches, statements
- Test files: `*.test.ts` exclusively

**Mock Pattern (CRITICAL)**

```typescript
// vi.mock() MUST come BEFORE imports
vi.mock('../../../src/db', () => ({ prisma: { interview: { create: vi.fn() } } }));
vi.mocked(Helper).mockReturnValue(...);
```

**Singleton Reset Pattern**

```typescript
beforeEach(() => {
  resetGraphInstance();
  resetDashScopeProvider();
  vi.clearAllMocks();
});
```

**Factory Functions for Mock State**

```typescript
function createMockState(overrides?: Partial<InterviewState>) {
  return { sessionId: "test", /* ...defaults */ ...overrides };
}
```

**Integration Test Server**

```typescript
server = buildServer({ skipPlugins: ["auth"] });
await server.ready();
const response = await server.inject({ method: "GET", url: "/api/webhook" });
```

**Prisma Mocking with Local Enums**

```typescript
const InterviewStatus = {
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
vi.mock("../../../src/db", () => ({
  prisma: { interview: { findUnique: vi.fn() } },
}));
```

**Fetch Interception**

```typescript
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
```

**Environment Handling**

```typescript
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv, KEY: "value" };
});
afterEach(() => {
  process.env = originalEnv;
});
```

## ANTI-PATTERNS

- NEVER import before `vi.mock()` - mocks must be hoisted
- NEVER use real Prisma client in unit tests - always mock `src/db`
- NEVER forget `vi.clearAllMocks()` in `beforeEach`
- NEVER use `.spec.ts` - only `.test.ts` naming convention
