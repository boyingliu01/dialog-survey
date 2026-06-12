# Fix Design for Issues #38, #37, #39 + Security Findings C1/C2

## Issue Summary

| # | Severity | Description | Root Cause |
|---|----------|-------------|------------|
| 38 | CRITICAL | API endpoints unprotected | `createVerifyApiKey()` defined but never registered |
| 37 | CRITICAL | Webhook drops all messages | Returns success without calling message processor |
| 39 | HIGH | PrismaClient per-message connection churn | `new PrismaClient()` inside `processStreamMessage()` loop |
| C1 | 🔴 CRITICAL | API key validation insecure | Substring match on first 8 chars, no hashing, no rate limiting |
| C2 | 🔴 CRITICAL | Webhook replay attacks | 5-min signature window without messageId dedup |

## Fix Approach

### C1: Secure API Key Storage (security redesign for #38)

**Problem**: Current `createVerifyApiKey` uses `details: { contains: apiKey.substring(0, 8) }` to match keys against auditLog JSON column. This is brute-forceable and has timing oracle risks.

**Fix**:
1. Add `ApiKey` model to Prisma schema (or use existing AuditLog with hashed key)
2. When generating API key: hash it with SHA-256, store hash + prefix (first 8 chars for UX lookup)
3. When verifying: look up by prefix, compare full hash (constant-time)
4. Add rate limiting: max 10 failed attempts per IP per minute

**Practical approach for this sprint** (no schema migration):
- Store keys in a dedicated `api_keys` JSON column on a singleton config record, OR
- Use the existing `security.ts` `generateApiKey()` format `ib_XXXX` but validate by comparing full key hash stored in `AuditLog.details` as `{ keyHash: "sha256..." }`
- For simplicity: compare `key.startsWith('ib_') && key.length === 67` (format check) + check hash in auditLog

**Minimum viable fix**:
1. Change `createVerifyApiKey` to: extract full key, compute SHA-256 hash, find auditLog where `details.keyHash === computedHash`
2. Add existing API keys migration note (keys must be regenerated)
3. Add rate limiter on 401 responses

**Files to modify**:
- `src/utils/security.ts` — rewrite `createVerifyApiKey` with hash-based comparison
- `src/middleware/api-auth.ts` — add rate limiting wrapper

### C2: Webhook Message Deduplication (security fix for #37)

**Problem**: DingTalk signature verification has 5-minute window. Without dedup, same message can be replayed.

**Fix**:
1. Add in-memory Set (or Redis) to track processed messageIds within last 5 minutes
2. In webhook handler, check messageId BEFORE calling processStreamMessage
3. If already processed, return `{result: "duplicate"}` without re-processing
4. Clean up expired entries from Set periodically

**Files to modify**:
- `src/api/webhook.ts` — add messageId dedup check before processStreamMessage call

### #38: API Authentication Middleware (updated per C1)

**Fix**:
1. Create `src/middleware/api-auth.ts` with hash-based key verification + rate limiting
2. Register as preHandler on ALL /api/* routes (including GET — per H1 finding)
3. `/webhook` remains unprotected (has its own signature verification)
4. `/health` and `/admin/*` routes remain public (admin has separate adminAuth)

**Files to modify**:
- `src/middleware/api-auth.ts` (NEW) — hash-based verification + rate limiting
- `src/api/plans.ts` — add preHandler on ALL routes
- `src/api/templates.ts` — add preHandler on ALL routes
- `src/api/analysis.ts` — add preHandler on ALL routes

### #37: Webhook Message Processing (updated per C2)

**Fix**:
1. Import `processStreamMessage` from `stream-message.service.ts`
2. Add messageId dedup check FIRST
3. After dedup pass, call `await processStreamMessage(...)`
4. Return result based on processing outcome

### #39: PrismaClient Injection (unchanged)

**Fix**:
1. Modify `processStreamMessage()` signature to accept optional `prisma?: PrismaClient` parameter
2. Remove local `new PrismaClient()` block
3. In `src/server.ts`, pass existing prisma instance

## Execution Order (updated)

1. **#39 first** (PrismaClient injection) — foundational, unblocks #37
2. **C2 second** (webhook dedup) — must precede #37 (security before functionality)
3. **#37 third** (webhook processing) — depends on #39 + C2
4. **C1 + #38 fourth** (API auth security redesign) — depends on C1 redesign being complete

## H1 and H2 Status

- **H1 (GET routes expose PII)**: Addressed by protecting ALL /api/* routes including GET
- **H2 (PrismaClient DI ambiguity)**: Will clarify during implementation — deprecate class constructor's PrismaClient creation, make parameter mandatory
