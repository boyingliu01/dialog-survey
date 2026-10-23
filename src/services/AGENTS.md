# SERVICES KNOWLEDGE BASE

> Updated: 2026-10-20. 16 service files (ASR removed).

## OVERVIEW
Application services layer: business logic orchestration for interview flow, report generation, DingTalk messaging, batch processing, and LLM integration.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Interview plans (composite) | `interview-plan.service.ts` | Routes to base/members/send sub-services |
| Plan CRUD | `interview-plan-base.service.ts` | Core plan create/read/update/delete |
| Member management | `interview-plan-members.service.ts` | Name + phone member add/remove, $transaction |
| Send + status | `interview-plan-send.service.ts` | Send tracking with SendStatus |
| DingTalk Stream processing | `stream-message.service.ts` | Message parsing + dedup + graph execution |
| Stream helpers | `stream-message-utils.ts` | Shared msg parsing utilities |
| Conversation orchestration | `conversation-engine.ts` | Wraps runInterviewGraph(), loads/saves state |
| Report generation | `analysis.service.ts` + `report.service.ts` | LLM-powered analysis → Markdown |
| Analytics | `analytics.service.ts` | KPI aggregation + distribution stats |
| Batch aggregation | `batch-aggregation.service.ts` | Pipeline with checkpoint recovery |
| LLM clustering | `llm-clustering.ts` | Sub-theme extraction via LLM |
| Intelligent follow-ups | `followup.service.ts` | LLM-generated 追问 based on responses |
| DingTalk messaging | `dingtalk.service.ts` | Send/receive via DingTalk API |
| LLM prompts | `prompt.service.ts` | Prompt templates |
| Template dimensions | `template-dimension.service.ts` | Dimension tag analysis |
| PDF/Excel export | `export.service.ts` | Report export to PDF + Excel |
| Dead letter | `dead-letter.service.ts` | AnalysisFailure upsert + retry |
| Audit cleanup | `audit-cleanup.service.ts` | Audit log cleanup policy |

## CONVENTIONS
- **Naming**: `*.service.ts` suffix for services, `*.ts` plain for utilities
- **Constructor DI**: Accept PrismaClient/repo instances; create defaults if none provided
- **Error handling**: Try/catch with `error()` logging + typed error subclasses (`PlanNotFoundError`, `MemberConflictError`, `InvalidStateError`, `InterviewNotFoundError`)
- **LLM calls**: Wrapped in `retry.ts` exponential backoff (MAX_RETRIES=2)
- **Interview Plan**: Split into 3 sub-services (base/members/send) + 1 composite router

## ANTI-PATTERNS (THIS MODULE)
None outstanding as of 2026-10-20. The four previously listed here were paid
down: `dead-letter.service` and `export.service` now take `PrismaClient` by
injection instead of constructing one; the `noExplicitAny` suppression in
`batch-aggregation.service` is gone; and `stream-message.service` keeps only one
intentional standalone export (`processStreamMessage`, a thin repo+service
wrapper) plus a re-export barrel of `stream-message-utils`.

Known trade-off to keep an eye on: `export.service` reads the CJK font from
`ASSETS_DIR` (default `./assets/fonts`) at export time and warns once if absent —
the Docker image must ship `assets/fonts/NotoSansCJKsc-Regular.otf` (see
Dockerfile). The font deliberately does **not** live under `reports/`: that is a
pure output directory, safe to delete, while the font is a tracked asset.

## SERVICE DEPENDENCIES
```
interview-plan.service → plan-base + plan-members + plan-send (routing only)
stream-message.service → core/graph.ts + interview-state.repository
conversation-engine → core/graph.ts + core/types
followup.service → volcengine.ts + retry.ts + prompt.service
report.service → volcengine.ts + retry.ts + prompt.service
analysis.service → report.service + export.service
analytics.service → analysis.service + batch-aggregation.service
batch-aggregation → llm-clustering + dead-letter + analytics
llm-clustering → integrations/llm/base.ts
export.service → integrations/dingtalk/client.ts + integrations/llm/base.ts
```
