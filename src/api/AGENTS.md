# API KNOWLEDGE BASE

> Updated: 2026-07-08. Fastify HTTP endpoints — 6 route files.

## OVERVIEW
Fastify route handlers organized by resource. No controller classes — standalone functions registered in `server.ts`.

## WHERE TO LOOK
| Route | File | Purpose |
|-------|------|---------|
| `GET /health` | `health.ts` | Health check + Prisma initialization |
| `POST /api/webhook` | `webhook.ts` | DingTalk webhook handler |
| `GET/POST/PUT/DELETE /api/plans` | `plans.ts` | Interview plan CRUD with member/phone support |
| `GET/POST/PUT/DELETE /api/templates` | `templates.ts` | Template CRUD |
| `GET/POST/PUT/DELETE /admin/api/templates` | `admin-templates.ts` | Admin template management |
| `GET/POST /api/analysis` | `analysis.ts` | Analysis/reporting endpoints |

## CONVENTIONS
- **Route registration**: Via Fastify `register()` in `server.ts`
- **PrismaClient DI**: Must receive via `register` opts, NEVER create new instance in API layer
- **Error responses**: Use Fastify `reply.code().send()` pattern
- **Admin auth**: Protected routes use `src/middleware/admin-auth.ts`
- **HTMX responses**: Admin routes return HTML fragments for `#main-content` swap

## ANTI-PATTERNS (THIS MODULE)
- `new PrismaClient()` in API layer → **ERROR** (must inject from server.ts)
- Service instantiation inside route handlers
- Missing admin-templates export in barrel (`src/index.ts`)

## HTMX URL CONVENTION
- **Shell URLs**: `/admin`, `/admin/templates`, `/admin/plans`, `/admin/analytics`
- **Fragment URLs**: `/admin/content/*` (HTMX swap targets)
- **Rule**: `hx-get`/`hx-post` to `#main-content` MUST use `/admin/content/*`

## VIEW-MODEL PROJECTIONS (`admin/view-models.ts`)
Shared projections keep every admin surface agreeing about the same row; assert
them here rather than through an HTTP round trip.

| Helper | Use |
|--------|-----|
| `fmtDate` | Localised date, `-` when empty |
| `buildInviteeNameMap` | Plan-detail member table (userId → name) |
| `findInviteeInfo` | Report surfaces + tree label (name/phone for one userId) |
| `interviewTreeLabel` | Admin-tree leaf: `姓名-电话-UserID` → `姓名-UserID` → `UserID` (issue #223) |
| `parseTemplateContent` | Template `content` JSON → `{content, questions}` |

`interviewTreeLabel` degrades in two steps, and treats `''`/whitespace as absent —
the import path stores `''` for a blank CSV cell, and `" -1234"` is worse than the
bare id. The name is user-supplied (imported CSV), so it must stay inside
Nunjucks autoescape; `tests/admin-tree-interview-label.test.ts` pins that.
