# API Layer

## OVERVIEW

Fastify routes with Zod validation, unified response format, and global auth middleware.

## WHERE TO LOOK

| Pattern            | Location                                               |
| ------------------ | ------------------------------------------------------ |
| Route definitions  | `*.ts` files (FastifyPluginCallback as default export) |
| Validation schemas | Inline Zod schemas before handlers                     |
| Webhook handling   | `webhook.ts` (DingTalk signature verification)         |
| Interview APIs     | `interviews.ts` (list, get, report, end)               |
| Templates          | `templates.ts` (list, get)                             |
| SSE streaming      | `stream.ts` (WebSocket with heartbeat)                 |
| Route registration | `server.ts` (all under `/api` prefix)                  |

## CONVENTIONS

**Route Definition Pattern**

```typescript
const plugin: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.get("/path", { schema }, handler);
  done();
};
export default plugin;
```

**Zod Schema Pattern**

- Coerce types: `z.coerce.number()`
- Enums: `z.enum(['pending', 'in_progress', 'completed'])`
- Object validation before handler

**Response Format** (mandatory)

```typescript
{ code: number, msg: string, data?: unknown }
// Success: { code: 0, msg: 'success', data: {...} }
// Error: reply.status(code).send({ code, msg })
```

**Naming**

- Response keys use snake_case
- Dates formatted as ISO strings

**Auth Plugin**

- Global middleware applied to all routes
- Whitelist for public paths: `/api/webhook`
- Protected routes require `X-API-Key` header

**Error Handling**

- Always set status code via `reply.status(code)`
- Never throw; return consistent error response format

## ANTI-PATTERNS

- Using `as any` for type coercion (use Zod instead)
- Throwing errors instead of formatted replies
- Returning camelCase keys in responses
- Adding routes outside plugin pattern
- Bypassing auth without whitelist entry
