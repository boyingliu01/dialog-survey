# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-01
**Commit:** efb941f
**Branch:** feature/typescript-rewrite

## OVERVIEW

AI-powered interview robot conducting async multi-turn interviews via DingTalk. LangGraph.js for conversation flow, DashScope (Qwen) for LLM, Fun-ASR for voice, Prisma 7.x ORM, PostgreSQL storage.

## STRUCTURE

```
interview-bot/
├── src/
│   ├── api/              # Fastify routes, Zod validation
│   ├── core/             # LangGraph StateGraph, nodes, edges
│   ├── services/         # External integrations (LLM, ASR, DingTalk)
│   ├── repositories/     # Prisma data access (static methods)
│   ├── db/               # Prisma client with adapter pattern
│   ├── utils/            # Validation, logging, JSON helpers
│   └── config.ts         # Zod-based environment config
├── tests/                # Vitest tests (unit/integration/e2e)
├── templates/            # JSON interview templates
├── prisma/               # Schema, Prisma 7.x config
└── reports/              # Generated Markdown reports
```

## WHERE TO LOOK

| Task                     | Location             | Notes                         |
| ------------------------ | -------------------- | ----------------------------- |
| Add interview question   | `templates/*.json`   | Edit template JSON            |
| Modify conversation flow | `src/core/graph.ts`  | StateGraph definition         |
| Add API endpoint         | `src/api/`           | FastifyPluginCallback pattern |
| Change LLM behavior      | `src/core/nodes.ts`  | Node functions                |
| Fix data persistence     | `src/repositories/`  | Prisma static methods         |
| Add webhook handling     | `src/api/webhook.ts` | DingTalk integration          |
| Configure environment    | `src/config.ts`      | Zod schema validation         |

## CONVENTIONS

- **TypeScript strict mode**: All strict flags enabled, no `any`
- **Zod validation**: Runtime validation for all external inputs
- **Barrel exports**: Every directory has `index.ts`
- **Singleton pattern**: Services use `getService()` getters
- **Static repositories**: `Repository.method()`, not instances
- **ESM only**: `type: "module"` in package.json

### LangGraph Patterns

```typescript
// State: Annotation.Root
const State = Annotation.Root({
  field: Annotation<Type>({ reducer, default })
});

// Graph: Method chaining
new StateGraph(State)
  .addNode('name', nodeFn)
  .addEdge(START, 'name')
  .compile({ checkpointer: new MemorySaver() });
```

### API Response Format

```typescript
// Success: { code: 0, msg: "success", data: {...} }
// Error: { code: number, msg: string }
// Snake_case in responses, dates as ISO strings
```

### Prisma 7.x JSON Handling

```typescript
// Required for strict JSON types
const data = JSON.parse(JSON.stringify(state));
await repo.update({ jsonField: data as unknown as never });
```

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER** use `as any` or `@ts-ignore` — fix the type
- **NEVER** skip `npm run type-check && npm run lint` before commit
- **NEVER** call external APIs without error handling
- **NEVER** bypass ConversationEngine for webhook → graph flow
- **NEVER** hardcode API endpoints — use `config.ts`
- **NEVER** ignore warnings — zero tolerance policy

## COMMANDS

```bash
npm install                    # Install dependencies
bunx prisma generate           # Generate Prisma client
npm run dev                    # Development server (tsx watch)
npm run type-check             # TypeScript check (must pass)
npm run lint                   # ESLint check (must pass)
npm test                       # Run all tests
npm run test:coverage          # Tests with coverage (80% threshold)
npm run build                  # Compile to ./dist
```

## NOTES

- **Zero Tolerance Policy**: All compiler/linter warnings must be fixed. Project rewritten from Python to TypeScript specifically for compile-time safety.
- **Prisma 7.x**: Uses adapter pattern (`@prisma/adapter-pg`), no URL in datasource, `prisma.config.ts` at root.
- **Coverage Requirement**: 80% threshold enforced across lines, functions, branches, statements.
- **Mock Before Import**: In tests, `vi.mock()` must be called before importing the module under test.
- **Singleton Resets**: Tests must call `resetGraphInstance()`, `resetDashScopeProvider()` in `beforeEach`.
