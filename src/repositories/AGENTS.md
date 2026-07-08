# Repositories Layer — Dialog Survey

Data access layer using Prisma ORM with constructor-based dependency injection.

## Where to Look

| File | Key Exports | Purpose |
|------|-------------|---------|
| `interview-state.repository.ts` | `InterviewStateRepository` | Persist interview graph state with optimistic locking (version field) |
| `interview-state-mapper.ts` | `InterviewStateMapper` | Translate between Prisma models and core domain types |
| `interview.repository.ts` | `InterviewRepository` | CRUD for interview sessions, cascade-aware operations |
| `message.repository.ts` | `MessageRepository` | Store user/assistant messages linked to interviews |
| `template.repository.ts` | `TemplateRepository` | Template CRUD + usage statistics aggregation (~360 lines) |

## Conventions

- **Constructor DI**: All repositories accept `prisma: PrismaClient` in constructor, injected via Fastify `registerOpts`
- **Typed errors**: Throw custom subclasses (`StatePersistenceError`) instead of raw Prisma errors
- **Optimistic locking**: `interview-state.repository` uses `version` field for concurrent update protection
- **Query patterns**: Use `prisma.$transaction()` for multi-step operations, `include` for eager loading relations
- **Return types**: All public methods return `Promise<T | null>` or `Promise<never>` on error

## Anti-Patterns

- **Direct Prisma in services**: Services should call repository methods, not `new PrismaClient()`
- **Missing version check**: State updates MUST include `where: { id, version }` to prevent overwrites
- **N+1 queries**: Always use `include` or `select` with relations, never fetch in loops
- **Unwrapped errors**: Catch Prisma errors and rethrow as domain-specific errors
- **Raw SQL**: Prefer Prisma query builder unless complex aggregations require `$queryRaw`
