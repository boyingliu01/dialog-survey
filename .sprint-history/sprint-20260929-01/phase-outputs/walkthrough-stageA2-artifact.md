# Code Walkthrough — Stage A changeset + R2 response (Prisma 7 facade switch)

## Scope

| Field | Value |
|---|---|
| Repo | dialog-survey (Fastify 5 + PostgreSQL + Prisma) |
| Branch | sprint/2026-09-29-01 |
| Commit under review | eb707f98c6ff3e4f97da079bf9b0c24a6cc9df42 |
| Range | 0820555^ → eb707f9 (Stage A changeset + walkthrough Round-2 response commit) |
| Diff base | 0820555^ (the full walkthrough range, covering both commits) |
| Stats | 90 files changed: +658 / −320 |

This is the Round-3 artifact: the previous range (88 files, +636/−318) plus the
Round-2 response commit eb707f9 (`fix(#149): walkthrough R2 responses — timeout
dedup + test hygiene`, 7 files, +25/−5). The response commit resolves concrete
Round-1/2 panel asks; every item is enumerated with evidence in the attached
context file `.sprint-state/phase-outputs/walkthrough-round2-response.md`.

### Delta introduced by eb707f9 (relative to the previously reviewed 0820555)

1. **Timeout constant dedup** (T-M): `PRISMA_CONNECT_TIMEOUT_MS = 5000` is now a
   single exported constant in `src/utils/prisma-factory.ts`; both test helpers
   (`tests/helpers/create-test-prisma.ts`, `tests/helpers/test-db.ts`) import it
   instead of duplicating the literal.
2. **Flake-triage protocol** (F-M2, explicit ask): new "Shared test DB (interim,
   until Stage B PGlite isolation)" section in `AGENTS.md` — rerun the file in
   isolation first (`npx vitest run <file> --no-file-parallelism`), fix by scoping
   fixtures, never weaken assertions; Stage B eliminates structurally.
3. **Vitest upgrade note** (F minor): `AGENTS.md` records that Vitest 4 awaits
   async suite factories (re-verify on upgrade).
4. **ws mock comment** (T minor): the fake `ws` module documents its single-symbol
   assumption.
5. **Docstring clarity** (T minor): `getSharedTestPrisma()` disconnect-ownership
   docstring now states per-file module isolation.
6. **`tests/db.test.ts`**: added `afterAll(vi.unstubAllEnvs)`.
   **`tests/graph.test.ts`**: stub intentionally lives for process lifetime — the
   experimentally-verified failure with `afterAll` unstub (pending `setImmediate`
   outlives the last test) is documented in the comment and in the response file.

## Change summary (cumulative range)

1. **Facade switch (production)**: `src/server.ts`, `src/utils/db.ts`, seeds, and
   ~20 service/api/core/repository modules import `PrismaClient` from the facade
   `src/utils/prisma-client.js` and construct only via `createPrismaClient()` from
   `src/utils/prisma-factory.js`. `BuildAppOptions` gains
   `prismaFactory?: () => PrismaClient`; `checkDatabaseConnection(prismaFactory =
   createPrismaClient)` moves the factory call inside its try block.
2. **Test-domain three-way classification of 26 Prisma construction sites**:
   (a) 22 → `getSharedTestPrisma()`; (b) 3 → kept in vi.mock domains; (c) 1 →
   helper-internal. New `tests/helpers/create-test-prisma.ts`; 79-file import
   rewrite (`@prisma/client` → facade) across src and tests.
3. **CI**: `.github/workflows/pr.yml` — explicit `prisma generate` before tsc/test
   in 6 jobs; `workflow_dispatch` added.
4. **Test stability fixes**: DATABASE_URL stubs, fake `ws` module, e2e login
   `waitUntil: 'commit'`, 15s polling for two HTMX fragment assertions, file-private
   userIds, `Phone-`-scoped safety net.

## Review focus (code-walkthrough dimensions)

- **Correctness**: facade/factory wiring, DI seam semantics, test classification soundness
- **Security**: no new injection / leak surface; CI and env handling
- **Maintainability**: import direction rules, naming, structure, constant ownership
- **Test coverage**: the changeset must not weaken existing coverage

---

## Full diff (0820555^ → eb707f9, 90 files)
diff --git a/.github/workflows/pr.yml b/.github/workflows/pr.yml
index ff214a4..b70bab5 100644
--- a/.github/workflows/pr.yml
+++ b/.github/workflows/pr.yml
@@ -3,6 +3,7 @@ name: PR Quality Gates
 on:
   pull_request:
     branches: [master, main]
+  workflow_dispatch:
 
 concurrency:
   group: ${{ github.workflow }}-${{ github.ref }}
@@ -25,6 +26,9 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Biome check
         run: npx biome check src/
 
@@ -64,6 +68,9 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
@@ -111,6 +118,9 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
@@ -195,6 +205,9 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
@@ -256,6 +269,9 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Install Playwright
         run: npx playwright install --with-deps chromium
 
@@ -294,5 +310,8 @@ jobs:
       - name: Install dependencies
         run: npm ci
 
+      - name: Generate Prisma client
+        run: npx prisma generate
+
       - name: Run smoke test
         run: npm run smoke
diff --git a/AGENTS.md b/AGENTS.md
index 9d43606..37eb9b9 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -81,6 +81,8 @@ npm run check:fix     # biome check + auto-fix
 ## Notes
 
 - **PG required**: Full `vitest run` needs PostgreSQL. `PrismaClientInitializationError` = DB not running, not a code bug.
+- **Shared test DB (interim, until Stage B PGlite isolation)**: the full suite runs against one PostgreSQL database with `fileParallelism: true`. On a gate failure, rerun the failing file in isolation first; for suspected cross-file collisions triage with `npx vitest run <file> --no-file-parallelism`, then fix by scoping fixtures (file-unique ids, cleanup predicates) — never by weakening assertions.
+- **Vitest async suites**: Vitest 4 awaits async `describe` callbacks — several suites rely on a describe-level `await getSharedTestPrisma()`. Re-verify async-suite semantics when upgrading Vitest.
 - **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → `fuser -k 3001/tcp` first.
 - **Test layers**: Unit (mock Prisma, no DB) / Integration (real PG, 3+ files) / E2E (Playwright, future).
 - **CI**: PRs run 7 jobs (analysis, unit, integration, security, coverage, smoke).
diff --git a/prisma/seed-satisfaction-survey.ts b/prisma/seed-satisfaction-survey.ts
index 4b4599d..a26d36d 100644
--- a/prisma/seed-satisfaction-survey.ts
+++ b/prisma/seed-satisfaction-survey.ts
@@ -1,7 +1,8 @@
-import { PrismaClient, type TemplateStatus } from '@prisma/client';
 import { info } from '../src/utils/logger.js';
+import type { TemplateStatus } from '../src/utils/prisma-client.js';
+import { createPrismaClient } from '../src/utils/prisma-factory.js';
 
-const prisma = new PrismaClient();
+const prisma = createPrismaClient();
 
 async function seedSatisfactionSurveyTemplate() {
   const existing = await prisma.template.findFirst({
diff --git a/prisma/seed-test-interview.ts b/prisma/seed-test-interview.ts
index a7da917..7f820d5 100644
--- a/prisma/seed-test-interview.ts
+++ b/prisma/seed-test-interview.ts
@@ -1,7 +1,8 @@
-import { InterviewStatus, PrismaClient } from '@prisma/client';
 import { info } from '../src/utils/logger.js';
+import { InterviewStatus } from '../src/utils/prisma-client.js';
+import { createPrismaClient } from '../src/utils/prisma-factory.js';
 
-const prisma = new PrismaClient();
+const prisma = createPrismaClient();
 
 async function seedTestInterviewPlan() {
   const templateId = process.argv[2] || 'a0ca7d02-9ac9-4388-9822-d83f71dd5ed9';
diff --git a/scripts/fix-max-followups.ts b/scripts/fix-max-followups.ts
index 9dcbbec..67eaf1a 100755
--- a/scripts/fix-max-followups.ts
+++ b/scripts/fix-max-followups.ts
@@ -11,10 +11,10 @@
  * npx tsx scripts/fix-max-followups.ts
  */
 
-import { PrismaClient } from '@prisma/client';
 import { error, info } from '../src/utils/logger.js';
+import { createPrismaClient } from '../src/utils/prisma-factory.js';
 
-const prisma = new PrismaClient();
+const prisma = createPrismaClient();
 
 async function fixMaxFollowups() {
   info('Starting maxFollowups fix...');
diff --git a/src/api/admin-templates.ts b/src/api/admin-templates.ts
index 2a58071..e728abb 100644
--- a/src/api/admin-templates.ts
+++ b/src/api/admin-templates.ts
@@ -1,5 +1,4 @@
 import { readFileSync } from 'node:fs';
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import { adminAuth } from '../middleware/admin-auth.js';
@@ -12,6 +11,7 @@ import type { ExportService } from '../services/export.service.js';
 import type { InterviewPlanService } from '../services/interview-plan.service.js';
 import { updateTemplateDimensions } from '../services/template-dimension.service.js';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export interface AdminTemplatesRoutesOptions {
   templateRepo: TemplateRepository;
diff --git a/src/api/analysis.ts b/src/api/analysis.ts
index 0cebcff..7182751 100644
--- a/src/api/analysis.ts
+++ b/src/api/analysis.ts
@@ -1,7 +1,7 @@
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import { z } from 'zod';
 import { AnalysisService } from '../services/analysis.service.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 const analyzeSingleSchema = z.object({
   interviewId: z.string().uuid(),
diff --git a/src/api/health.ts b/src/api/health.ts
index 37b4f03..8318c96 100644
--- a/src/api/health.ts
+++ b/src/api/health.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 interface HealthResponse {
   status: 'healthy' | 'degraded' | 'unhealthy';
diff --git a/src/api/plans.ts b/src/api/plans.ts
index 7217f74..028bd16 100644
--- a/src/api/plans.ts
+++ b/src/api/plans.ts
@@ -1,4 +1,3 @@
-import type { PlanStatus, PrismaClient } from '@prisma/client';
 import { parse } from 'csv-parse/sync';
 import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
 import { z } from 'zod';
@@ -15,6 +14,7 @@ import {
   PlanNotFoundError,
 } from '../services/interview-plan.service.js';
 import { normalizePhone } from '../services/member-verification.service.js';
+import type { PlanStatus, PrismaClient } from '../utils/prisma-client.js';
 
 const createPlanSchema = z.object({
   name: z.string().min(1),
diff --git a/src/api/templates.ts b/src/api/templates.ts
index 6376ffb..9196ae4 100644
--- a/src/api/templates.ts
+++ b/src/api/templates.ts
@@ -1,9 +1,9 @@
-import type { PrismaClient } from '@prisma/client';
-import { TemplateStatus } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import { z } from 'zod';
 import type { TemplateRepository } from '../repositories/template.repository.js';
 import { updateTemplateDimensions } from '../services/template-dimension.service.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
+import { TemplateStatus } from '../utils/prisma-client.js';
 
 export interface TemplateRoutesOptions {
   templateRepo: TemplateRepository;
diff --git a/src/core/graph.ts b/src/core/graph.ts
index 85bbb5b..ba6f075 100644
--- a/src/core/graph.ts
+++ b/src/core/graph.ts
@@ -1,7 +1,7 @@
-import type { PrismaClient } from '@prisma/client';
 import { AnalysisService } from '../services/analysis.service.js';
 import { getDb } from '../utils/db.js';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 import { interviewingNode } from './nodes/interviewing.js';
 import { planningNode } from './nodes/planning.js';
 import { DEFAULT_CLOSING_MESSAGE, type InterviewState, type NodeInput } from './types/index.js';
diff --git a/src/core/nodes/interviewing.ts b/src/core/nodes/interviewing.ts
index 11420b1..d248410 100644
--- a/src/core/nodes/interviewing.ts
+++ b/src/core/nodes/interviewing.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { generateSmartResponse } from '../../services/followup.service.js';
 import { info, warn } from '../../utils/logger.js';
+import type { PrismaClient } from '../../utils/prisma-client.js';
 import {
   DEFAULT_CLOSING_MESSAGE,
   type InterviewState,
diff --git a/src/core/nodes/planning.ts b/src/core/nodes/planning.ts
index b9c5d63..b57279f 100644
--- a/src/core/nodes/planning.ts
+++ b/src/core/nodes/planning.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { polishFirstQuestion } from '../../services/followup.service.js';
+import type { PrismaClient } from '../../utils/prisma-client.js';
 import type { InterviewState, NodeOutput } from '../types/index.js';
 import { loadTemplateContent } from './template-utils.js';
 
diff --git a/src/core/nodes/template-utils.ts b/src/core/nodes/template-utils.ts
index bb5283d..dad3647 100644
--- a/src/core/nodes/template-utils.ts
+++ b/src/core/nodes/template-utils.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { TemplateRepository } from '../../repositories/template.repository.js';
+import type { PrismaClient } from '../../utils/prisma-client.js';
 import { DEFAULT_TEMPLATE_CONTENT, type TemplateContent } from '../types/index.js';
 
 export async function loadTemplateContent(
diff --git a/src/repositories/interview-state.repository.ts b/src/repositories/interview-state.repository.ts
index aa4d43c..1ac8161 100644
--- a/src/repositories/interview-state.repository.ts
+++ b/src/repositories/interview-state.repository.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { DEFAULT_MAX_FOLLOWUPS, type InterviewState } from '../core/types/index.js';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 import { mapInterviewToInterviewState } from './interview-state-mapper.js';
 
 export class StatePersistenceError extends Error {
diff --git a/src/repositories/interview.repository.ts b/src/repositories/interview.repository.ts
index f072c11..6198fdd 100644
--- a/src/repositories/interview.repository.ts
+++ b/src/repositories/interview.repository.ts
@@ -1,4 +1,4 @@
-import type { PrismaClient } from '@prisma/client';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export class InterviewRepository {
   constructor(private prisma: PrismaClient) {}
diff --git a/src/repositories/message.repository.ts b/src/repositories/message.repository.ts
index 1746b3f..c2454d4 100644
--- a/src/repositories/message.repository.ts
+++ b/src/repositories/message.repository.ts
@@ -1,4 +1,4 @@
-import type { Message, PrismaClient } from '@prisma/client';
+import type { Message, PrismaClient } from '../utils/prisma-client.js';
 
 export class MessageRepository {
   private prisma: PrismaClient;
diff --git a/src/repositories/template.repository.ts b/src/repositories/template.repository.ts
index 99d2d74..4e43c7e 100644
--- a/src/repositories/template.repository.ts
+++ b/src/repositories/template.repository.ts
@@ -1,4 +1,4 @@
-import { type PrismaClient, type Template, TemplateStatus } from '@prisma/client';
+import { type PrismaClient, type Template, TemplateStatus } from '../utils/prisma-client.js';
 
 export class TemplateRepository {
   private readonly prisma: PrismaClient;
diff --git a/src/server.ts b/src/server.ts
index b8cff4e..9bd3341 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -8,11 +8,12 @@ import rateLimit from '@fastify/rate-limit';
 import secureSession from '@fastify/secure-session';
 import fastifyStatic from '@fastify/static';
 import fastifyView from '@fastify/view';
-import { PrismaClient } from '@prisma/client';
 import dotenv from 'dotenv';
 import Fastify from 'fastify';
 import type { FastifyInstance, FastifyServerOptions } from 'fastify';
 import nunjucks from 'nunjucks';
+import type { PrismaClient } from './utils/prisma-client.js';
+import { createPrismaClient } from './utils/prisma-factory.js';
 
 // Load .env early but explicitly (not via side-effect import).
 // Use override only outside tests so vi.stubEnv() controls env in test runs.
@@ -56,16 +57,20 @@ const LOG_LEVEL = process.env['LOG_LEVEL'] || (NODE_ENV === 'production' ? 'info
 
 type BuildAppOptions = {
   readonly fastifyFactory?: (options: FastifyServerOptions) => FastifyInstance;
+  readonly prismaFactory?: () => PrismaClient;
 };
 
 export function createFastify(options: FastifyServerOptions): FastifyInstance {
   return Fastify(options);
 }
 
-export async function checkDatabaseConnection(): Promise<boolean> {
-  const prisma = new PrismaClient();
+export async function checkDatabaseConnection(
+  prismaFactory: () => PrismaClient = createPrismaClient
+): Promise<boolean> {
+  let prisma: PrismaClient | undefined;
 
   try {
+    prisma = prismaFactory();
     await Promise.race([
       prisma.$queryRaw`SELECT 1`,
       new Promise((_, reject) =>
@@ -81,7 +86,9 @@ export async function checkDatabaseConnection(): Promise<boolean> {
     error('Run: sudo systemctl start postgresql');
     return false;
   } finally {
-    await prisma.$disconnect();
+    if (prisma) {
+      await prisma.$disconnect();
+    }
   }
 }
 
@@ -164,7 +171,7 @@ export async function buildApp(options: BuildAppOptions = {}) {
       options: { autoescape: true, noCache: true },
     });
 
-    const applicationPrisma = new PrismaClient();
+    const applicationPrisma = (options.prismaFactory ?? createPrismaClient)();
     prisma = applicationPrisma;
     const templateRepo = new TemplateRepository(applicationPrisma);
     const streamClient = DingTalkStreamClient.fromEnv();
diff --git a/src/services/analysis.service.ts b/src/services/analysis.service.ts
index ceb3cb8..de8e468 100644
--- a/src/services/analysis.service.ts
+++ b/src/services/analysis.service.ts
@@ -1,7 +1,7 @@
-import type { BatchAnalysisReport } from '@prisma/client';
-import type { PrismaClient } from '@prisma/client';
 import { error, info } from '../utils/logger.js';
 import { anonymizePII } from '../utils/pii-anonymizer.js';
+import type { BatchAnalysisReport } from '../utils/prisma-client.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 import { recordAnalysisFailure } from './dead-letter.service.js';
 import {
   type Report,
diff --git a/src/services/analytics.service.ts b/src/services/analytics.service.ts
index 90be17c..cbaf9ca 100644
--- a/src/services/analytics.service.ts
+++ b/src/services/analytics.service.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export interface AnalyticsKPIs {
   totalInterviews: number;
diff --git a/src/services/audit-cleanup.service.ts b/src/services/audit-cleanup.service.ts
index 324d043..29ad5f7 100644
--- a/src/services/audit-cleanup.service.ts
+++ b/src/services/audit-cleanup.service.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export class AuditCleanupService {
   constructor(private prisma: PrismaClient) {}
diff --git a/src/services/dead-letter.service.ts b/src/services/dead-letter.service.ts
index 2ebe23d..f180059 100644
--- a/src/services/dead-letter.service.ts
+++ b/src/services/dead-letter.service.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export async function recordAnalysisFailure(
   prisma: PrismaClient,
diff --git a/src/services/export.service.ts b/src/services/export.service.ts
index 8b1ca64..38e6dc8 100644
--- a/src/services/export.service.ts
+++ b/src/services/export.service.ts
@@ -1,9 +1,9 @@
 import { existsSync, mkdirSync, readFileSync } from 'node:fs';
 import { join } from 'node:path';
-import type { PrismaClient } from '@prisma/client';
 import { chromium } from 'playwright';
 import * as XLSX from 'xlsx';
 import { info, warn } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 function loadInviteeInfo(inviteeData: unknown, userId: string): { name?: string; phone?: string } {
   if (!Array.isArray(inviteeData)) return {};
diff --git a/src/services/interview-plan-base.service.ts b/src/services/interview-plan-base.service.ts
index 5cb7972..064d204 100644
--- a/src/services/interview-plan-base.service.ts
+++ b/src/services/interview-plan-base.service.ts
@@ -1,5 +1,5 @@
-import { PlanStatus, type PrismaClient } from '@prisma/client';
 import { info } from '../utils/logger.js';
+import { PlanStatus, type PrismaClient } from '../utils/prisma-client.js';
 
 export interface CreatePlanInput {
   name: string;
diff --git a/src/services/interview-plan-members.service.ts b/src/services/interview-plan-members.service.ts
index 5085420..6d4090a 100644
--- a/src/services/interview-plan-members.service.ts
+++ b/src/services/interview-plan-members.service.ts
@@ -1,11 +1,11 @@
-import { SendStatus } from '@prisma/client';
-import type { Prisma, PrismaClient } from '@prisma/client';
 import { DEFAULT_MAX_FOLLOWUPS } from '../core/types/index.js';
 import { DingTalkClient } from '../integrations/dingtalk/client.js';
 import { messageSender } from '../integrations/dingtalk/message-sender.js';
 import type { DingTalkStreamClient } from '../integrations/dingtalk/stream-client.js';
 import type { TokenManager } from '../integrations/dingtalk/token-manager.js';
 import { error, info } from '../utils/logger.js';
+import { SendStatus } from '../utils/prisma-client.js';
+import type { Prisma, PrismaClient } from '../utils/prisma-client.js';
 import type { InviteeData } from './interview-plan-base.service.js';
 import { InterviewPlanSendService } from './interview-plan-send.service.js';
 import { verifyPhoneToName } from './member-verification.service.js';
diff --git a/src/services/interview-plan-send.service.ts b/src/services/interview-plan-send.service.ts
index 850390c..45d8e26 100644
--- a/src/services/interview-plan-send.service.ts
+++ b/src/services/interview-plan-send.service.ts
@@ -1,6 +1,6 @@
-import { PlanStatus, SendStatus } from '@prisma/client';
 import { messageSender } from '../integrations/dingtalk/message-sender.js';
 import { error, info, warn } from '../utils/logger.js';
+import { PlanStatus, SendStatus } from '../utils/prisma-client.js';
 import { InterviewPlanServiceBase } from './interview-plan-base.service.js';
 
 export class InterviewPlanSendService extends InterviewPlanServiceBase {
diff --git a/src/services/stream-message.service.ts b/src/services/stream-message.service.ts
index 0435409..318bf32 100644
--- a/src/services/stream-message.service.ts
+++ b/src/services/stream-message.service.ts
@@ -1,10 +1,10 @@
-import type { PrismaClient } from '@prisma/client';
 import { runInterviewGraph } from '../core/graph.js';
 import type { GraphResult } from '../core/graph.js';
 import { DEFAULT_MAX_FOLLOWUPS, type InterviewState } from '../core/types/index.js';
 import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
 import { TemplateRepository } from '../repositories/template.repository.js';
 import { error, info } from '../utils/logger.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 import {
   isAllowedWebhookUrl,
   parseStreamMessage,
diff --git a/src/services/template-dimension.service.ts b/src/services/template-dimension.service.ts
index 8fbd208..43f1520 100644
--- a/src/services/template-dimension.service.ts
+++ b/src/services/template-dimension.service.ts
@@ -1,5 +1,5 @@
-import type { PrismaClient } from '@prisma/client';
 import { dimensionsArraySchema } from '../schemas/dimensions.js';
+import type { PrismaClient } from '../utils/prisma-client.js';
 
 export async function updateTemplateDimensions(
   prisma: PrismaClient,
diff --git a/src/utils/db.ts b/src/utils/db.ts
index bcc63c3..f332bdc 100644
--- a/src/utils/db.ts
+++ b/src/utils/db.ts
@@ -1,4 +1,5 @@
-import { PrismaClient } from '@prisma/client';
+import type { PrismaClient } from './prisma-client.js';
+import { createPrismaClient } from './prisma-factory.js';
 
 let _prisma: PrismaClient | null = null;
 
@@ -7,10 +8,13 @@ let _prisma: PrismaClient | null = null;
  * Use sparingly — prefer DI (constructor injection) for most cases.
  * This exists for fire-and-forget background tasks (e.g., analyzingNode)
  * where threading DI through the graph would be excessive.
+ *
+ * Delegates construction to createPrismaClient(), so it fails loudly when
+ * DATABASE_URL is missing instead of building a half-configured client.
  */
 export function getDb(): PrismaClient {
   if (!_prisma) {
-    _prisma = new PrismaClient();
+    _prisma = createPrismaClient();
   }
   return _prisma;
 }
diff --git a/src/utils/prisma-factory.ts b/src/utils/prisma-factory.ts
index fc2648f..5b5d851 100644
--- a/src/utils/prisma-factory.ts
+++ b/src/utils/prisma-factory.ts
@@ -1,6 +1,9 @@
 import { PrismaPg } from '@prisma/adapter-pg';
 import { PrismaClient } from './prisma-client.js';
 
+/** pg connect timeout (v6 engine baseline); shared with test helpers to prevent drift. */
+export const PRISMA_CONNECT_TIMEOUT_MS = 5000;
+
 export interface PrismaFactoryOptions {
   connectionString?: string;
 }
@@ -20,6 +23,9 @@ export function createPrismaClient(options: PrismaFactoryOptions = {}): PrismaCl
   if (!connectionString) {
     throw new Error('DATABASE_URL is required to create a PrismaClient');
   }
-  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 });
+  const adapter = new PrismaPg({
+    connectionString,
+    connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
+  });
   return new PrismaClient({ adapter });
 }
diff --git a/src/utils/security.ts b/src/utils/security.ts
index 7a7d4d8..eb2eea6 100644
--- a/src/utils/security.ts
+++ b/src/utils/security.ts
@@ -1,6 +1,6 @@
 import crypto from 'node:crypto';
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import type { PrismaClient } from './prisma-client.js';
 
 export interface AuthUser {
   userId: string;
diff --git a/tests/admin-delete.test.ts b/tests/admin-delete.test.ts
index 5d29683..adbc0f5 100644
--- a/tests/admin-delete.test.ts
+++ b/tests/admin-delete.test.ts
@@ -1,10 +1,11 @@
 import { resolve } from 'node:path';
 import fastifyStatic from '@fastify/static';
 import fastifyView from '@fastify/view';
-import { PrismaClient } from '@prisma/client';
 import nunjucks from 'nunjucks';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { registerTestAdminAuth } from './helpers/admin-auth.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -13,7 +14,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 // Create a minimal test app
 async function createTestApp() {
diff --git a/tests/admin-plan-csrf.test.ts b/tests/admin-plan-csrf.test.ts
index b2fbebe..87922f2 100644
--- a/tests/admin-plan-csrf.test.ts
+++ b/tests/admin-plan-csrf.test.ts
@@ -1,11 +1,12 @@
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
-import { PrismaClient } from '@prisma/client';
 import Fastify from 'fastify';
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import { interviewPlanRoutes, isAdministrativePlanMutation } from '../src/api/plans.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { createVerifyApiKey, hashApiKey } from '../src/utils/security.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 type BrowserState = {
   readonly cookie: string;
@@ -40,8 +41,8 @@ function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): s
   return [...cookies.values()].join('; ');
 }
 
-describe('browser-driven plan mutation CSRF', () => {
-  const prisma = new PrismaClient();
+describe('browser-driven plan mutation CSRF', async () => {
+  const prisma = await getSharedTestPrisma();
   const apps: ReturnType<typeof Fastify>[] = [];
 
   async function createApp(): Promise<ReturnType<typeof Fastify>> {
diff --git a/tests/admin-plan-route-csrf.test.ts b/tests/admin-plan-route-csrf.test.ts
index 6a5fd5b..2f9f4e8 100644
--- a/tests/admin-plan-route-csrf.test.ts
+++ b/tests/admin-plan-route-csrf.test.ts
@@ -1,10 +1,10 @@
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
-import { PrismaClient } from '@prisma/client';
 import Fastify, { type FastifyInstance } from 'fastify';
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import { interviewPlanRoutes, isAdministrativePlanMutation } from '../src/api/plans.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 type BrowserState = {
   readonly cookie: string;
@@ -96,8 +96,8 @@ function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): s
   return [...cookies.values()].join('; ');
 }
 
-describe('plan route session CSRF', () => {
-  const prisma = new PrismaClient();
+describe('plan route session CSRF', async () => {
+  const prisma = await getSharedTestPrisma();
   const apps: FastifyInstance[] = [];
 
   async function createApp(): Promise<FastifyInstance> {
diff --git a/tests/admin-shell-csrf.test.ts b/tests/admin-shell-csrf.test.ts
index e017f88..fcbfd8f 100644
--- a/tests/admin-shell-csrf.test.ts
+++ b/tests/admin-shell-csrf.test.ts
@@ -2,7 +2,6 @@ import { readFile } from 'node:fs/promises';
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
 import fastifyView from '@fastify/view';
-import { PrismaClient } from '@prisma/client';
 import Fastify from 'fastify';
 import nunjucks from 'nunjucks';
 import { afterEach, describe, expect, it, vi } from 'vitest';
@@ -12,6 +11,7 @@ import { TemplateRepository } from '../src/repositories/template.repository.js';
 import { AnalysisService } from '../src/services/analysis.service.js';
 import { AnalyticsService } from '../src/services/analytics.service.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): string {
   const cookies = new Map<string, string>();
@@ -26,8 +26,8 @@ function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): s
   return [...cookies.values()].join('; ');
 }
 
-describe('admin shell CSRF transport', () => {
-  const prisma = new PrismaClient();
+describe('admin shell CSRF transport', async () => {
+  const prisma = await getSharedTestPrisma();
   const apps: ReturnType<typeof Fastify>[] = [];
 
   afterEach(async () => {
diff --git a/tests/admin-template-csrf.test.ts b/tests/admin-template-csrf.test.ts
index e61423c..68710d7 100644
--- a/tests/admin-template-csrf.test.ts
+++ b/tests/admin-template-csrf.test.ts
@@ -1,6 +1,5 @@
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
-import { PrismaClient } from '@prisma/client';
 import Fastify, { type FastifyInstance } from 'fastify';
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import { adminTemplatesRoutes } from '../src/api/admin-templates.js';
@@ -9,6 +8,7 @@ import { TemplateRepository } from '../src/repositories/template.repository.js';
 import { AnalysisService } from '../src/services/analysis.service.js';
 import { AnalyticsService } from '../src/services/analytics.service.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 type BrowserState = {
   readonly cookie: string;
@@ -59,8 +59,8 @@ function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): s
   return [...cookies.values()].join('; ');
 }
 
-describe('admin template mutation CSRF', () => {
-  const prisma = new PrismaClient();
+describe('admin template mutation CSRF', async () => {
+  const prisma = await getSharedTestPrisma();
   const apps: FastifyInstance[] = [];
 
   async function createApp(): Promise<FastifyInstance> {
diff --git a/tests/admin-templates-extra.test.ts b/tests/admin-templates-extra.test.ts
index 9a7819b..fefc736 100644
--- a/tests/admin-templates-extra.test.ts
+++ b/tests/admin-templates-extra.test.ts
@@ -1,7 +1,8 @@
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
-import { PrismaClient } from '@prisma/client';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -115,7 +116,11 @@ async function createTestApp() {
   return app;
 }
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 interface TestContext {
   app: Awaited<ReturnType<typeof createTestApp>>;
diff --git a/tests/admin-templates-import.test.ts b/tests/admin-templates-import.test.ts
index f4cb96f..4da7a02 100644
--- a/tests/admin-templates-import.test.ts
+++ b/tests/admin-templates-import.test.ts
@@ -4,7 +4,6 @@ import csrfProtection from '@fastify/csrf-protection';
 import fastifyFormbody from '@fastify/formbody';
 import secureSession from '@fastify/secure-session';
 import fastifyView from '@fastify/view';
-import type { Template, TemplateStatus } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import nunjucks from 'nunjucks';
@@ -13,6 +12,7 @@ import type { InterviewRepository } from '../src/repositories/interview.reposito
 import type { AnalysisService } from '../src/services/analysis.service.js';
 import type { AnalyticsService } from '../src/services/analytics.service.js';
 import type { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import type { Template, TemplateStatus } from '../src/utils/prisma-client.js';
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = dirname(__filename);
@@ -42,62 +42,65 @@ const mockAnalysisReportFindMany = vi.fn(() => Promise.resolve([]));
 const mockAnalysisReportFindFirst = vi.fn(() => Promise.resolve(null));
 const mockBatchReportCount = vi.fn(() => Promise.resolve(0));
 
-vi.mock('@prisma/client', () => ({
-  PrismaClient: class {
-    template = {
-      get create() {
-        return mockTemplateCreate;
-      },
-      get findUnique() {
-        return mockTemplateFindUnique;
-      },
-      get findMany() {
-        return mockTemplateFindMany;
-      },
-      get update() {
-        return mockTemplateUpdate;
-      },
-      get delete() {
-        return mockTemplateDelete;
-      },
-      get count() {
-        return mockTemplateCount;
-      },
-    };
-    interviewPlan = {
-      get findMany() {
-        return mockInterviewPlanFindMany;
-      },
-      get groupBy() {
-        return mockInterviewPlanGroupBy;
-      },
-    };
-    interview = {
-      get findMany() {
-        return mockInterviewFindMany;
-      },
-      get groupBy() {
-        return mockInterviewGroupBy;
-      },
-    };
-    analysisReport = {
-      get findMany() {
-        return mockAnalysisReportFindMany;
-      },
-      get findFirst() {
-        return mockAnalysisReportFindFirst;
-      },
-    };
-    batchAnalysisReport = {
-      get count() {
-        return mockBatchReportCount;
-      },
-    };
-    $disconnect = vi.fn(() => Promise.resolve());
-    $connect = vi.fn(() => Promise.resolve());
-  },
-  TemplateStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' },
-}));
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
+  const original = (await importOriginal()) as Record<string, unknown>;
+  return {
+    ...original,
+    PrismaClient: class {
+      template = {
+        get create() {
+          return mockTemplateCreate;
+        },
+        get findUnique() {
+          return mockTemplateFindUnique;
+        },
+        get findMany() {
+          return mockTemplateFindMany;
+        },
+        get update() {
+          return mockTemplateUpdate;
+        },
+        get delete() {
+          return mockTemplateDelete;
+        },
+        get count() {
+          return mockTemplateCount;
+        },
+      };
+      interviewPlan = {
+        get findMany() {
+          return mockInterviewPlanFindMany;
+        },
+        get groupBy() {
+          return mockInterviewPlanGroupBy;
+        },
+      };
+      interview = {
+        get findMany() {
+          return mockInterviewFindMany;
+        },
+        get groupBy() {
+          return mockInterviewGroupBy;
+        },
+      };
+      analysisReport = {
+        get findMany() {
+          return mockAnalysisReportFindMany;
+        },
+        get findFirst() {
+          return mockAnalysisReportFindFirst;
+        },
+      };
+      batchAnalysisReport = {
+        get count() {
+          return mockBatchReportCount;
+        },
+      };
+      $disconnect = vi.fn(() => Promise.resolve());
+      $connect = vi.fn(() => Promise.resolve());
+    },
+  };
+});
 
 const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');
 const { TemplateRepository } = await import('../src/repositories/template.repository.js');
@@ -156,8 +159,10 @@ describe('Admin Templates Import', () => {
       templates: viewsDir,
       options: { autoescape: true, noCache: true },
     });
-    const { PrismaClient } = await import('@prisma/client');
-    const prisma = new PrismaClient();
+    const { PrismaClient } = await import('../src/utils/prisma-client.js');
+    // This file mocks the facade with a no-arg fake, while the real Prisma 7 ctor
+    // requires an adapter — cast so the mock-domain construction stays type-legal.
+    const prisma = new (PrismaClient as unknown as new () => InstanceType<typeof PrismaClient>)();
     await app.register(adminTemplatesRoutes, {
       templateRepo: new TemplateRepository(prisma),
       interviewPlanService: {} as unknown as InterviewPlanService,
diff --git a/tests/admin-templates-integration.test.ts b/tests/admin-templates-integration.test.ts
index 5d1941f..960cf61 100644
--- a/tests/admin-templates-integration.test.ts
+++ b/tests/admin-templates-integration.test.ts
@@ -4,15 +4,15 @@ import csrfProtection from '@fastify/csrf-protection';
 import fastifyFormbody from '@fastify/formbody';
 import secureSession from '@fastify/secure-session';
 import fastifyView from '@fastify/view';
-/**
- * @intent Integration tests for admin template CRUD — save → load → render flow
- * @covers admin-templates.ts: buildContentFromForm, validateTemplateContent, POST, PUT, GET edit
- */
-import type { Template, TemplateStatus } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import nunjucks from 'nunjucks';
 import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
+/**
+ * @intent Integration tests for admin template CRUD — save → load → render flow
+ * @covers admin-templates.ts: buildContentFromForm, validateTemplateContent, POST, PUT, GET edit
+ */
+import type { Template, TemplateStatus } from '../src/utils/prisma-client.js';
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = dirname(__filename);
@@ -43,62 +43,65 @@ const mockAnalysisReportFindMany = vi.fn(() => Promise.resolve([]));
 const mockAnalysisReportFindFirst = vi.fn(() => Promise.resolve(null));
 const mockBatchReportCount = vi.fn(() => Promise.resolve(0));
 
-vi.mock('@prisma/client', () => ({
-  PrismaClient: class {
-    template = {
-      get create() {
-        return mockTemplateCreate;
-      },
-      get findUnique() {
-        return mockTemplateFindUnique;
-      },
-      get findMany() {
-        return mockTemplateFindMany;
-      },
-      get update() {
-        return mockTemplateUpdate;
-      },
-      get delete() {
-        return mockTemplateDelete;
-      },
-      get count() {
-        return mockTemplateCount;
-      },
-    };
-    interviewPlan = {
-      get findMany() {
-        return mockInterviewPlanFindMany;
-      },
-      get groupBy() {
-        return mockInterviewPlanGroupBy;
-      },
-    };
-    interview = {
-      get findMany() {
-        return mockInterviewFindMany;
-      },
-      get groupBy() {
-        return mockInterviewGroupBy;
-      },
-    };
-    analysisReport = {
-      get findMany() {
-        return mockAnalysisReportFindMany;
-      },
-      get findFirst() {
-        return mockAnalysisReportFindFirst;
-      },
-    };
-    batchAnalysisReport = {
-      get count() {
-        return mockBatchReportCount;
-      },
-    };
-    $disconnect = vi.fn(() => Promise.resolve());
-    $connect = vi.fn(() => Promise.resolve());
-  },
-  TemplateStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' },
-}));
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
+  const original = (await importOriginal()) as Record<string, unknown>;
+  return {
+    ...original,
+    PrismaClient: class {
+      template = {
+        get create() {
+          return mockTemplateCreate;
+        },
+        get findUnique() {
+          return mockTemplateFindUnique;
+        },
+        get findMany() {
+          return mockTemplateFindMany;
+        },
+        get update() {
+          return mockTemplateUpdate;
+        },
+        get delete() {
+          return mockTemplateDelete;
+        },
+        get count() {
+          return mockTemplateCount;
+        },
+      };
+      interviewPlan = {
+        get findMany() {
+          return mockInterviewPlanFindMany;
+        },
+        get groupBy() {
+          return mockInterviewPlanGroupBy;
+        },
+      };
+      interview = {
+        get findMany() {
+          return mockInterviewFindMany;
+        },
+        get groupBy() {
+          return mockInterviewGroupBy;
+        },
+      };
+      analysisReport = {
+        get findMany() {
+          return mockAnalysisReportFindMany;
+        },
+        get findFirst() {
+          return mockAnalysisReportFindFirst;
+        },
+      };
+      batchAnalysisReport = {
+        get count() {
+          return mockBatchReportCount;
+        },
+      };
+      $disconnect = vi.fn(() => Promise.resolve());
+      $connect = vi.fn(() => Promise.resolve());
+    },
+  };
+});
 
 // Import AFTER vi.mock so the mocked PrismaClient is used
 const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');
@@ -223,13 +226,15 @@ describe('Admin Templates Integration — save → load → render', () => {
       templates: viewsDir,
       options: { autoescape: true, noCache: true },
     });
-    const { PrismaClient } = await import('@prisma/client');
+    const { PrismaClient } = await import('../src/utils/prisma-client.js');
     const { TemplateRepository } = await import('../src/repositories/template.repository.js');
     const { InterviewRepository } = await import('../src/repositories/interview.repository.js');
     const { AnalysisService } = await import('../src/services/analysis.service.js');
     const { AnalyticsService } = await import('../src/services/analytics.service.js');
     const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
-    const prisma = new PrismaClient();
+    // This file mocks the facade with a no-arg fake, while the real Prisma 7 ctor
+    // requires an adapter — cast so the mock-domain construction stays type-legal.
+    const prisma = new (PrismaClient as unknown as new () => InstanceType<typeof PrismaClient>)();
     await app.register(adminTemplatesRoutes, {
       templateRepo: new TemplateRepository(prisma),
       interviewPlanService: new InterviewPlanService(prisma),
diff --git a/tests/admin-templates.test.ts b/tests/admin-templates.test.ts
index 3915cea..c86d6f9 100644
--- a/tests/admin-templates.test.ts
+++ b/tests/admin-templates.test.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { TemplateRepository } from '../src/repositories/template.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
diff --git a/tests/admin-tree.test.ts b/tests/admin-tree.test.ts
index 7c0a12a..ef05153 100644
--- a/tests/admin-tree.test.ts
+++ b/tests/admin-tree.test.ts
@@ -1,10 +1,15 @@
-import { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
 import { buildApp } from '../src/server.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 const ADMIN_KEY = 'test-admin-key';
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Admin Tree Routes', () => {
   let app: FastifyInstance;
diff --git a/tests/analysis-api.test.ts b/tests/analysis-api.test.ts
index 6f3e4f8..eddc75f 100644
--- a/tests/analysis-api.test.ts
+++ b/tests/analysis-api.test.ts
@@ -1,7 +1,8 @@
-import { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -10,7 +11,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 async function createApp(): Promise<FastifyInstance> {
   const app = Fastify({ logger: false });
@@ -99,8 +104,8 @@ describe('Analysis API Endpoints', () => {
     });
   });
 
-  describe('POST /api/analysis/aggregate/:planId with real DB data', () => {
-    const prisma = new PrismaClient();
+  describe('POST /api/analysis/aggregate/:planId with real DB data', async () => {
+    const prisma = await getSharedTestPrisma();
 
     it('should return 409 when a RUNNING aggregate report already exists', async () => {
       const [template, plan] = await prisma.$transaction(async (tx) => {
diff --git a/tests/analysis.test.ts b/tests/analysis.test.ts
index 9936bec..67abed5 100644
--- a/tests/analysis.test.ts
+++ b/tests/analysis.test.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { AnalysisService } from '../src/services/analysis.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/services/report.service.js', () => ({
   generateReport: vi.fn().mockResolvedValue({
diff --git a/tests/analytics.service.test.ts b/tests/analytics.service.test.ts
index d229454..7ea90a5 100644
--- a/tests/analytics.service.test.ts
+++ b/tests/analytics.service.test.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { AnalyticsService } from '../src/services/analytics.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
diff --git a/tests/audit-cleanup.service.test.ts b/tests/audit-cleanup.service.test.ts
index 4336ba0..98a1a9f 100644
--- a/tests/audit-cleanup.service.test.ts
+++ b/tests/audit-cleanup.service.test.ts
@@ -1,9 +1,15 @@
-import { PrismaClient } from '@prisma/client';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { AuditCleanupService } from '../src/services/audit-cleanup.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
-const service = new AuditCleanupService(prisma);
+let prisma: PrismaClient;
+let service: AuditCleanupService;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+  service = new AuditCleanupService(prisma);
+});
 
 describe('AuditCleanupService', () => {
   beforeAll(async () => {
diff --git a/tests/batch-aggregate-api.test.ts b/tests/batch-aggregate-api.test.ts
index 0b3c0b8..760b95b 100644
--- a/tests/batch-aggregate-api.test.ts
+++ b/tests/batch-aggregate-api.test.ts
@@ -1,9 +1,14 @@
-import { PrismaClient } from '@prisma/client';
 import Fastify, { type FastifyInstance } from 'fastify';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { analysisRoutes } from '../src/api/analysis.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 /** @test REQ-BATCH-001 @intent verify POST aggregate triggers batch analysis @covers AC-BATCH-001-01 */
 describe('POST /api/analysis/aggregate/:planId', () => {
diff --git a/tests/batch-import.test.ts b/tests/batch-import.test.ts
index c5c639b..daad7eb 100644
--- a/tests/batch-import.test.ts
+++ b/tests/batch-import.test.ts
@@ -1,23 +1,28 @@
-import { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { registerTestAdminAuth } from './helpers/admin-auth.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-// Mock DingTalk client — phone lookup returns controlled results without real API calls
+// Mock DingTalk client — phone lookup returns controlled results without real API calls.
+// The userIds are file-unique: every test file shares one database and runs in
+// parallel, and import-commit rejects a userId that has a live interview in any
+// other plan — a shared id would make these assertions depend on other files.
 const MockDingTalkClient = class {
   static fromEnv() {
     return new MockDingTalkClient();
   }
   async getUserIdByMobile(phone: string) {
-    if (phone === '13800138000') return { found: true, userId: 'user_zhangsan', name: '' };
-    if (phone === '13900139000') return { found: true, userId: 'user_lisi', name: '' };
+    if (phone === '13800138000') return { found: true, userId: 'batch-user-zhangsan', name: '' };
+    if (phone === '13900139000') return { found: true, userId: 'batch-user-lisi', name: '' };
     return { found: false };
   }
   async getUserByUserId(userId: string) {
-    if (userId === 'user_zhangsan')
-      return { userid: 'user_zhangsan', name: '张三', mobile: '13800138000' };
-    if (userId === 'user_lisi') return { userid: 'user_lisi', name: '李四', mobile: '13900139000' };
+    if (userId === 'batch-user-zhangsan')
+      return { userid: 'batch-user-zhangsan', name: '张三', mobile: '13800138000' };
+    if (userId === 'batch-user-lisi')
+      return { userid: 'batch-user-lisi', name: '李四', mobile: '13900139000' };
     throw new Error('user not found');
   }
 };
@@ -41,7 +46,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 function makeCsv(header: string, ...rows: string[]): string {
   return [header, ...rows].join('\n');
@@ -115,7 +124,7 @@ describe('Batch Import API', () => {
         expect(body.failed).toBe(0);
         expect(body.summary).toBe('all_passed');
         expect(body.results[0].status).toBe('ok');
-        expect(body.results[0].userId).toBe('user_zhangsan');
+        expect(body.results[0].userId).toBe('batch-user-zhangsan');
         expect(body.results[0].dingtalkName).toBe('张三');
       } finally {
         if (planId) {
@@ -309,7 +318,7 @@ describe('Batch Import API', () => {
             rowIndex: 2,
             phone: '13800138000',
             status: 'ok',
-            userId: 'user_zhangsan',
+            userId: 'batch-user-zhangsan',
             dingtalkName: '张三',
             message: '验证通过',
           },
@@ -317,7 +326,7 @@ describe('Batch Import API', () => {
             rowIndex: 3,
             phone: '13900139000',
             status: 'ok',
-            userId: 'user_lisi',
+            userId: 'batch-user-lisi',
             dingtalkName: '李四',
             message: '验证通过',
           },
@@ -374,7 +383,7 @@ describe('Batch Import API', () => {
             rowIndex: 2,
             phone: '13800138000',
             status: 'ok',
-            userId: 'user_zhangsan',
+            userId: 'batch-user-zhangsan',
             dingtalkName: '张三',
             message: '验证通过',
           },
@@ -431,7 +440,7 @@ describe('Batch Import API', () => {
             rowIndex: 2,
             phone: '13800138000',
             status: 'ok',
-            userId: 'user_zhangsan',
+            userId: 'batch-user-zhangsan',
             dingtalkName: '张三',
             message: '验证通过',
           },
@@ -490,7 +499,7 @@ describe('Batch Import API', () => {
                 rowIndex: 2,
                 phone: '13800138000',
                 status: 'ok',
-                userId: 'user_zhangsan',
+                userId: 'batch-user-zhangsan',
                 dingtalkName: '张三',
                 message: '验证通过',
               },
@@ -521,7 +530,7 @@ describe('Batch Import API', () => {
                 rowIndex: 2,
                 phone: '13800138000',
                 status: 'ok',
-                userId: 'user_zhangsan',
+                userId: 'batch-user-zhangsan',
                 dingtalkName: '张三',
                 message: '验证通过',
               },
@@ -572,7 +581,7 @@ describe('Batch Import API', () => {
             rowIndex: 2,
             phone: '13800138000',
             status: 'ok',
-            userId: 'user_zhangsan',
+            userId: 'batch-user-zhangsan',
             dingtalkName: '张三',
             message: '验证通过',
           },
diff --git a/tests/create-test-prisma.test.ts b/tests/create-test-prisma.test.ts
new file mode 100644
index 0000000..30f7e59
--- /dev/null
+++ b/tests/create-test-prisma.test.ts
@@ -0,0 +1,44 @@
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { createTestPrisma, getSharedTestPrisma } from './helpers/create-test-prisma.js';
+
+/**
+ * @test REQ-PRISMA7-002
+ * @intent create-test-prisma helper contract: file-level singleton vs
+ *   independent instance, both usable for real queries
+ * @covers AC-PRISMA7-002-01
+ */
+describe('create-test-prisma helper', () => {
+  let shared: PrismaClient;
+
+  beforeAll(async () => {
+    shared = await getSharedTestPrisma();
+  });
+
+  afterAll(async () => {
+    await shared.$disconnect();
+  });
+
+  it('getSharedTestPrisma returns the same instance on repeated calls', async () => {
+    const again = await getSharedTestPrisma();
+    expect(again).toBe(shared);
+  });
+
+  it('shared instance serves real queries', async () => {
+    const rows = await shared.$queryRaw`SELECT 1 AS ok`;
+    expect(rows).toEqual([{ ok: 1 }]);
+  });
+
+  it('createTestPrisma returns an independent instance that the caller can disconnect', async () => {
+    const isolated = await createTestPrisma();
+    expect(isolated).not.toBe(shared);
+
+    const rows = await isolated.$queryRaw`SELECT 1 AS ok`;
+    expect(rows).toEqual([{ ok: 1 }]);
+
+    await isolated.$disconnect();
+
+    const stillAlive = await shared.$queryRaw`SELECT 1 AS ok`;
+    expect(stillAlive).toEqual([{ ok: 1 }]);
+  });
+});
diff --git a/tests/db.test.ts b/tests/db.test.ts
index b22040f..6b7e029 100644
--- a/tests/db.test.ts
+++ b/tests/db.test.ts
@@ -1,13 +1,19 @@
-import type { PrismaClient } from '@prisma/client';
-import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
-// Use a callable-constructible class so the hoisted mock factory supports `new`
-vi.mock('@prisma/client', () => {
+// createPrismaClient() requires DATABASE_URL; this file never reaches a real
+// database (facade is mocked below), so any well-formed URL satisfies it.
+vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');
+
+// Partial mock: real facade symbols (types/enums) + constructible mock class,
+// so `new PrismaClient()` from the facade stays callable inside this file.
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
   class MockPrismaClient {
     $disconnect = vi.fn();
     $connect = vi.fn();
   }
-  return { PrismaClient: MockPrismaClient };
+  const original = (await importOriginal()) as Record<string, unknown>;
+  return { ...original, PrismaClient: MockPrismaClient };
 });
 
 describe('getDb', () => {
@@ -68,3 +74,7 @@ describe('shutdownDb', () => {
     expect(db.$disconnect).toHaveBeenCalled();
   });
 });
+
+afterAll(() => {
+  vi.unstubAllEnvs();
+});
diff --git a/tests/dead-letter.test.ts b/tests/dead-letter.test.ts
index e298a82..eb7ce9d 100644
--- a/tests/dead-letter.test.ts
+++ b/tests/dead-letter.test.ts
@@ -1,8 +1,13 @@
-import { PrismaClient } from '@prisma/client';
-import { afterAll, beforeEach, describe, expect, it } from 'vitest';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { getFailedAnalyses, recordAnalysisFailure } from '../src/services/dead-letter.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Analysis Dead-Letter Service', () => {
   beforeEach(async () => {
diff --git a/tests/dingtalk-stream.test.ts b/tests/dingtalk-stream.test.ts
index e029381..d65e50c 100644
--- a/tests/dingtalk-stream.test.ts
+++ b/tests/dingtalk-stream.test.ts
@@ -2,6 +2,33 @@ import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { WebSocket } from 'ws';
 import { DingTalkStreamClient } from '../src/integrations/dingtalk/stream-client.js';
 
+// Every test here drives the socket by invoking captured handlers directly, so
+// a real connection buys nothing — but it does open network I/O to
+// wss-open-connection.dingtalk.com, whose 400 lands as an unhandled 'error'
+// event (the tests replace WebSocket.prototype.on, so no listener ever attaches).
+// The fake below exports only `WebSocket`: stream-client.ts imports no other
+// `ws` symbol, so extend this mock if that import ever changes.
+vi.mock('ws', async () => {
+  const { EventEmitter } = await import('node:events');
+  class FakeWebSocket extends EventEmitter {
+    static readonly CONNECTING = 0;
+    static readonly OPEN = 1;
+    static readonly CLOSING = 2;
+    static readonly CLOSED = 3;
+    readyState = 0;
+    send(): void {}
+    close(): void {
+      this.readyState = 3;
+      this.emit('close', 1000, Buffer.from(''));
+    }
+    terminate(): void {
+      this.readyState = 3;
+      this.emit('close', 1006, Buffer.from(''));
+    }
+  }
+  return { WebSocket: FakeWebSocket };
+});
+
 describe('DingTalkStreamClient', () => {
   const mockConfig = {
     clientId: 'test-client-id',
diff --git a/tests/e2e/admin-core.e2e.test.ts b/tests/e2e/admin-core.e2e.test.ts
index 57ac49a..06c0708 100644
--- a/tests/e2e/admin-core.e2e.test.ts
+++ b/tests/e2e/admin-core.e2e.test.ts
@@ -77,8 +77,15 @@ describe('Admin Core Paths (Playwright E2E)', () => {
         throw err;
       });
 
-      const mainContent = await page.textContent('#main-content');
-      expect(mainContent).toContain('计划进度');
+      // HTMX swaps the fragment after the response lands; poll instead of
+      // sampling #main-content once (the swap can trail the response under load).
+      await vi.waitFor(
+        async () => {
+          const mainContent = await page.textContent('#main-content');
+          expect(mainContent).toContain('计划进度');
+        },
+        { timeout: 15_000 }
+      );
     });
 
     it('should not crash on non-existent content route', async () => {
@@ -102,8 +109,13 @@ describe('Admin Core Paths (Playwright E2E)', () => {
         newTemplateBtn.click(),
       ]);
 
-      const mainContent = await page.textContent('#main-content');
-      expect(mainContent).toContain('新建模板');
+      await vi.waitFor(
+        async () => {
+          const mainContent = await page.textContent('#main-content');
+          expect(mainContent).toContain('新建模板');
+        },
+        { timeout: 15_000 }
+      );
     });
 
     it('should navigate to template import page', async () => {
diff --git a/tests/e2e/helpers/admin-login.ts b/tests/e2e/helpers/admin-login.ts
index a46523c..c2e2c21 100644
--- a/tests/e2e/helpers/admin-login.ts
+++ b/tests/e2e/helpers/admin-login.ts
@@ -40,8 +40,10 @@ export async function loginAdminViaForm(page: Page, baseUrl: string): Promise<vo
   await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'load' });
   await page.fill('#username', E2E_ADMIN_USERNAME);
   await page.fill('#password', E2E_ADMIN_PASSWORD);
+  // Only the URL transition matters here; waiting for 'load' lets a slow
+  // post-login page fetch outlast the budget on a loaded full-suite run.
   await Promise.all([
-    page.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 }),
+    page.waitForURL(`${baseUrl}/admin`, { waitUntil: 'commit', timeout: 30_000 }),
     page.click('button[type="submit"]'),
   ]);
 }
diff --git a/tests/e2e/helpers/e2e-server.ts b/tests/e2e/helpers/e2e-server.ts
index d93f633..ccdee22 100644
--- a/tests/e2e/helpers/e2e-server.ts
+++ b/tests/e2e/helpers/e2e-server.ts
@@ -1,7 +1,7 @@
-// @no-test-required: E2E test infrastructure helper, exercised by E2E test files
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import type { Browser, BrowserContext } from 'playwright';
+// @no-test-required: E2E test infrastructure helper, exercised by E2E test files
+import type { PrismaClient } from '../../../src/utils/prisma-client.js';
 import { TestDatabase } from '../../helpers/test-db.js';
 
 const OWNED_ENV_KEYS = [
diff --git a/tests/e2e/helpers/mock-dingtalk.ts b/tests/e2e/helpers/mock-dingtalk.ts
index d8c2da6..05eb03e 100644
--- a/tests/e2e/helpers/mock-dingtalk.ts
+++ b/tests/e2e/helpers/mock-dingtalk.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import type { StreamMessage } from '../../../src/services/stream-message-utils.js';
 import { processStreamMessage } from '../../../src/services/stream-message.service.js';
+import type { PrismaClient } from '../../../src/utils/prisma-client.js';
 
 const USER_MAP: Record<string, { name: string; mobile: string }> = {
   user_zhangsan: { name: '张三', mobile: '13800138000' },
diff --git a/tests/e2e/plan-lifecycle.e2e.test.ts b/tests/e2e/plan-lifecycle.e2e.test.ts
index 7ff9101..2a4f19c 100644
--- a/tests/e2e/plan-lifecycle.e2e.test.ts
+++ b/tests/e2e/plan-lifecycle.e2e.test.ts
@@ -1,6 +1,6 @@
-import type { PlanStatus } from '@prisma/client';
 import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
 import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
+import type { PlanStatus } from '../../src/utils/prisma-client.js';
 import {
   E2E_ADMIN_API_KEY,
   loginAdminViaForm,
diff --git a/tests/export.integration.test.ts b/tests/export.integration.test.ts
index 57a81bf..3f327de 100644
--- a/tests/export.integration.test.ts
+++ b/tests/export.integration.test.ts
@@ -7,9 +7,9 @@
  */
 import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
 import { join } from 'node:path';
-import type { PrismaClient } from '@prisma/client';
 import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
 import { ExportService } from '../src/services/export.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { TestDatabase } from './helpers/test-db.js';
 
 vi.mock('playwright', () => ({
diff --git a/tests/export.service.test.ts b/tests/export.service.test.ts
index 4b6a3dd..a078465 100644
--- a/tests/export.service.test.ts
+++ b/tests/export.service.test.ts
@@ -1,10 +1,10 @@
 import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
 import { tmpdir } from 'node:os';
 import { join } from 'node:path';
-import type { PrismaClient } from '@prisma/client';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import * as XLSX from 'xlsx';
 import { ExportService } from '../src/services/export.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
diff --git a/tests/graph.test.ts b/tests/graph.test.ts
index 7f81c4f..c6ddd8c 100644
--- a/tests/graph.test.ts
+++ b/tests/graph.test.ts
@@ -2,6 +2,14 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { runInterviewGraph } from '../src/core/graph.js';
 import type { InterviewState } from '../src/core/types/index.js';
 
+// graph.ts fires a background analysis via setImmediate → getDb(), which
+// createPrismaClient() refuses to build without DATABASE_URL; any well-formed
+// URL keeps that fire-and-forget path logging instead of throwing uncaught.
+// The stub intentionally lives for the process lifetime: a pending setImmediate
+// can outlive the file's last test, so an afterAll unstub would re-create the
+// uncaught throw. Vitest's per-file module isolation scopes it to this file.
+vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');
+
 vi.mock('../src/core/nodes/planning.js', () => ({
   planningNode: vi.fn().mockResolvedValue({
     currentQuestion: 0,
diff --git a/tests/health-api.test.ts b/tests/health-api.test.ts
index c8065ff..840f211 100644
--- a/tests/health-api.test.ts
+++ b/tests/health-api.test.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -17,9 +17,10 @@ class MockPrismaClient {
   $disconnect = mockDisconnect;
 }
 
-vi.mock('@prisma/client', () => ({
-  PrismaClient: MockPrismaClient,
-}));
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
+  const original = (await importOriginal()) as Record<string, unknown>;
+  return { ...original, PrismaClient: MockPrismaClient };
+});
 
 const mockFetch = vi.fn();
 
diff --git a/tests/helpers/create-test-prisma.ts b/tests/helpers/create-test-prisma.ts
new file mode 100644
index 0000000..a61316e
--- /dev/null
+++ b/tests/helpers/create-test-prisma.ts
@@ -0,0 +1,40 @@
+import { PrismaPg } from '@prisma/adapter-pg';
+import { PrismaClient } from '../../src/utils/prisma-client.js';
+import { PRISMA_CONNECT_TIMEOUT_MS } from '../../src/utils/prisma-factory.js';
+
+function resolveTestDatabaseUrl(): string {
+  return (
+    process.env['TEST_DATABASE_URL'] ||
+    process.env['DATABASE_URL'] ||
+    'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test'
+  );
+}
+
+function buildClient(): PrismaClient {
+  const adapter = new PrismaPg({
+    connectionString: resolveTestDatabaseUrl(),
+    connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
+  });
+  return new PrismaClient({ adapter });
+}
+
+let shared: PrismaClient | undefined;
+
+/**
+ * File-level singleton: repeated calls within one test file share one instance
+ * (and, from Stage B on, one PGlite database). Disconnect ownership belongs to
+ * the importing test file's `afterAll` / `TestDatabase.teardown()`; module
+ * isolation is per test file, so that disconnect cannot affect other files.
+ */
+export async function getSharedTestPrisma(): Promise<PrismaClient> {
+  shared ??= buildClient();
+  return shared;
+}
+
+/**
+ * Independent instance for genuinely isolated scenarios; the caller owns
+ * `$disconnect()`.
+ */
+export async function createTestPrisma(): Promise<PrismaClient> {
+  return buildClient();
+}
diff --git a/tests/helpers/test-db.ts b/tests/helpers/test-db.ts
index b7f9270..19e8981 100644
--- a/tests/helpers/test-db.ts
+++ b/tests/helpers/test-db.ts
@@ -1,5 +1,7 @@
 import { execSync } from 'node:child_process';
-import { PrismaClient } from '@prisma/client';
+import { PrismaPg } from '@prisma/adapter-pg';
+import { PrismaClient } from '../../src/utils/prisma-client.js';
+import { PRISMA_CONNECT_TIMEOUT_MS } from '../../src/utils/prisma-factory.js';
 
 export class TestDatabase {
   private readonly prisma: PrismaClient;
@@ -14,7 +16,11 @@ export class TestDatabase {
       'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test';
 
     process.env['DATABASE_URL'] = this.databaseUrl;
-    this.prisma = new PrismaClient();
+    const adapter = new PrismaPg({
+      connectionString: this.databaseUrl,
+      connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
+    });
+    this.prisma = new PrismaClient({ adapter });
   }
 
   async setup(): Promise<void> {
@@ -37,6 +43,12 @@ export class TestDatabase {
     }
   }
 
+  /**
+   * Order contract: `isClosed` is set synchronously before any await, so a
+   * concurrent `cleanup()` can only hit its early-exit branch. After teardown,
+   * `cleanup()` is a silent no-op. Callers must not call `cleanup()` first and
+   * expect it to persist anything — it only deletes rows listed in `ids`.
+   */
   async teardown(): Promise<void> {
     if (this.isClosed) return;
     this.isClosed = true;
@@ -51,6 +63,11 @@ export class TestDatabase {
     }
   }
 
+  /**
+   * Deletes rows for the given ids (per-test isolation). Silent no-op after
+   * `teardown()` (see order contract above); before teardown it throws when the
+   * database is unreachable.
+   */
   async cleanup(ids: {
     responses?: string[];
     messages?: string[];
@@ -64,6 +81,7 @@ export class TestDatabase {
     auditLogs?: string[];
     apiKeys?: string[];
   }): Promise<void> {
+    if (this.isClosed) return;
     if (ids.responses?.length) {
       await this.prisma.response.deleteMany({ where: { id: { in: ids.responses } } });
     }
diff --git a/tests/helpers/test-server.ts b/tests/helpers/test-server.ts
index 5e482e8..a9f79e2 100644
--- a/tests/helpers/test-server.ts
+++ b/tests/helpers/test-server.ts
@@ -4,9 +4,9 @@ import cors from '@fastify/cors';
 import fastifyFormbody from '@fastify/formbody';
 import fastifyMultipart from '@fastify/multipart';
 import fastifyView from '@fastify/view';
-import type { PrismaClient } from '@prisma/client';
 import Fastify, { type FastifyInstance } from 'fastify';
 import nunjucks from 'nunjucks';
+import type { PrismaClient } from '../../src/utils/prisma-client.js';
 
 import { adminTemplatesRoutes } from '../../src/api/admin-templates.js';
 import { analysisRoutes } from '../../src/api/analysis.js';
diff --git a/tests/interview-plan-additional.test.ts b/tests/interview-plan-additional.test.ts
index e2e9703..d7a57ef 100644
--- a/tests/interview-plan-additional.test.ts
+++ b/tests/interview-plan-additional.test.ts
@@ -1,7 +1,7 @@
-import { PlanStatus } from '@prisma/client';
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { PlanStatus } from '../src/utils/prisma-client.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
   messageSender: {
diff --git a/tests/interview-plan-members-phone.test.ts b/tests/interview-plan-members-phone.test.ts
index 72291ea..640ec15 100644
--- a/tests/interview-plan-members-phone.test.ts
+++ b/tests/interview-plan-members-phone.test.ts
@@ -1,8 +1,9 @@
-import { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { registerTestAdminAuth } from './helpers/admin-auth.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 // Mock DingTalk client — phone lookup returns controlled results without real API calls
 class MockDingTalkClient {
@@ -44,7 +45,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 async function cleanPlan(planId: string) {
   await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
@@ -77,11 +82,16 @@ describe('Phone member tests (real DB integration)', () => {
     await prisma.$disconnect();
   });
 
-  // Safety net: clean up any leftover test data
+  // Safety net: clean up any leftover test data. Scoped to this file's own
+  // 'Phone-' templates — every file shares one database and runs in parallel,
+  // so an unscoped deleteMany(userId) would wipe other files' live fixtures.
   afterEach(async () => {
     await prisma.interview
       .deleteMany({
-        where: { userId: { in: ['user_zhangsan', 'user_lisi', 'phone-test-1', 'phone-test-2'] } },
+        where: {
+          userId: { in: ['user_zhangsan', 'user_lisi', 'phone-test-1', 'phone-test-2'] },
+          template: { name: { startsWith: 'Phone-' } },
+        },
       })
       .catch(() => {});
   });
diff --git a/tests/interview-plan-members.test.ts b/tests/interview-plan-members.test.ts
index 037866d..54f15ea 100644
--- a/tests/interview-plan-members.test.ts
+++ b/tests/interview-plan-members.test.ts
@@ -1,6 +1,6 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
   messageSender: {
diff --git a/tests/interview-plan.integration.test.ts b/tests/interview-plan.integration.test.ts
index 207b162..0ec80f6 100644
--- a/tests/interview-plan.integration.test.ts
+++ b/tests/interview-plan.integration.test.ts
@@ -5,7 +5,7 @@
  * Prerequisites: PostgreSQL running + dialog_survey_test database
  * Run: npx vitest run tests/interview-plan.integration.test.ts
  */
-import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
 import { hashApiKey } from '../src/utils/security.js';
 import { type TestServer, createTestServer } from './helpers/test-server.js';
 
@@ -17,6 +17,8 @@ describe('InterviewPlan API (Integration)', () => {
   let createdIds: { apiKeys: string[]; templates: string[]; interviewPlans: string[] };
 
   beforeAll(async () => {
+    vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
+    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
     ctx = await createTestServer();
   });
 
@@ -54,6 +56,7 @@ describe('InterviewPlan API (Integration)', () => {
 
   afterAll(async () => {
     await ctx.teardown();
+    vi.unstubAllEnvs();
   });
 
   describe('POST /api/plans', () => {
diff --git a/tests/interview-plan.test.ts b/tests/interview-plan.test.ts
index 3f71126..233ce44 100644
--- a/tests/interview-plan.test.ts
+++ b/tests/interview-plan.test.ts
@@ -1,8 +1,8 @@
-import { PlanStatus } from '@prisma/client';
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { DingTalkClient } from '../src/integrations/dingtalk/client.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { PlanStatus } from '../src/utils/prisma-client.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 describe('InterviewPlanService', () => {
   let service: InterviewPlanService;
diff --git a/tests/interview-repository.test.ts b/tests/interview-repository.test.ts
index cb9f37a..39130ac 100644
--- a/tests/interview-repository.test.ts
+++ b/tests/interview-repository.test.ts
@@ -1,9 +1,15 @@
-import { PrismaClient } from '@prisma/client';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { InterviewRepository } from '../src/repositories/interview.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
-const repo = new InterviewRepository(prisma);
+let prisma: PrismaClient;
+let repo: InterviewRepository;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+  repo = new InterviewRepository(prisma);
+});
 
 describe('InterviewRepository', () => {
   let templateId: string;
diff --git a/tests/interview-state-full.test.ts b/tests/interview-state-full.test.ts
index fa99332..81ec878 100644
--- a/tests/interview-state-full.test.ts
+++ b/tests/interview-state-full.test.ts
@@ -1,7 +1,7 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { InterviewState } from '../src/core/types/index.js';
 import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 describe('InterviewStateRepository - saveFullState (完整多轮对话)', () => {
   let repository: InterviewStateRepository;
diff --git a/tests/interview-state-repository.test.ts b/tests/interview-state-repository.test.ts
index dddf59b..22394a8 100644
--- a/tests/interview-state-repository.test.ts
+++ b/tests/interview-state-repository.test.ts
@@ -1,10 +1,10 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { InterviewState } from '../src/core/types/index.js';
 import {
   InterviewStateRepository,
   StatePersistenceError,
 } from '../src/repositories/interview-state.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 const mockInterview = {
   id: 'interview-123',
diff --git a/tests/interviewing-node.test.ts b/tests/interviewing-node.test.ts
index 239035c..c6cab76 100644
--- a/tests/interviewing-node.test.ts
+++ b/tests/interviewing-node.test.ts
@@ -287,7 +287,7 @@ describe('interviewingNode', () => {
       }),
     });
 
-    const mockPrisma = {} as unknown as import('@prisma/client').PrismaClient;
+    const mockPrisma = {} as unknown as import('../src/utils/prisma-client.js').PrismaClient;
     const state = { ...baseState, templateId: 'custom-template', currentQuestion: 0 };
     const result = await interviewingNode(state, { content: '回答', prisma: mockPrisma });
 
diff --git a/tests/message-repository.test.ts b/tests/message-repository.test.ts
index b929321..4662fd6 100644
--- a/tests/message-repository.test.ts
+++ b/tests/message-repository.test.ts
@@ -1,9 +1,15 @@
-import { PrismaClient } from '@prisma/client';
 import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
 import { MessageRepository } from '../src/repositories/message.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
-const repo = new MessageRepository(prisma);
+let prisma: PrismaClient;
+let repo: MessageRepository;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+  repo = new MessageRepository(prisma);
+});
 
 describe('MessageRepository', () => {
   let interviewId: string;
diff --git a/tests/planning-node.test.ts b/tests/planning-node.test.ts
index efed8c4..a53f45d 100644
--- a/tests/planning-node.test.ts
+++ b/tests/planning-node.test.ts
@@ -1,7 +1,7 @@
-import type { PrismaClient } from '@prisma/client';
 import { describe, expect, it, vi } from 'vitest';
 import { planningNode } from '../src/core/nodes/planning.js';
 import type { InterviewState } from '../src/core/types/index.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 // Mock polishFirstQuestion to avoid LLM API dependency in unit tests.
 // polishFirstQuestion is integration-tested separately in followup service tests.
diff --git a/tests/plans-api.test.ts b/tests/plans-api.test.ts
index 846deb2..3d8c477 100644
--- a/tests/plans-api.test.ts
+++ b/tests/plans-api.test.ts
@@ -1,11 +1,12 @@
 import csrfProtection from '@fastify/csrf-protection';
 import secureSession from '@fastify/secure-session';
-import { PlanStatus, PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
 import { interviewPlanRoutes } from '../src/api/plans.js';
 import { InterviewPlanService } from '../src/services/interview-plan.service.js';
+import { PlanStatus, type PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
   messageSender: {
@@ -24,7 +25,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Interview Plan API Endpoints', () => {
   let fastify: FastifyInstance;
diff --git a/tests/report-api.test.ts b/tests/report-api.test.ts
index d233108..654a078 100644
--- a/tests/report-api.test.ts
+++ b/tests/report-api.test.ts
@@ -1,10 +1,15 @@
-import { PrismaClient } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { analysisRoutes } from '../src/api/analysis.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 /** @test REQ-REPORT-001 @intent verify GET aggregate report by batchReportId @covers AC-REPORT-001-01 */
 describe('Report API Endpoints', () => {
diff --git a/tests/schema-analysis-dimensions.test.ts b/tests/schema-analysis-dimensions.test.ts
index 6f38ee0..9dbcf86 100644
--- a/tests/schema-analysis-dimensions.test.ts
+++ b/tests/schema-analysis-dimensions.test.ts
@@ -1,7 +1,12 @@
-import { PrismaClient } from '@prisma/client';
-import { afterAll, describe, expect, it } from 'vitest';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Schema: Analysis Dimensions', () => {
   describe('Template model', () => {
diff --git a/tests/security.test.ts b/tests/security.test.ts
index 4439d22..7c921ae 100644
--- a/tests/security.test.ts
+++ b/tests/security.test.ts
@@ -1,12 +1,14 @@
-import type { PrismaClient } from '@prisma/client';
 import type { FastifyReply, FastifyRequest } from 'fastify';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { anonymizeData, generateApiKey, timingSafeEqualStrings } from '../src/utils/security.js';
 
-vi.mock('@prisma/client', () => {
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
   const mockFindFirst = vi.fn();
   (globalThis as Record<string, unknown>)['__mockFindFirst'] = mockFindFirst;
+  const original = (await importOriginal()) as Record<string, unknown>;
   return {
+    ...original,
     PrismaClient: class MockPrismaClient {
       auditLog = { findFirst: mockFindFirst };
     },
diff --git a/tests/server-api.test.ts b/tests/server-api.test.ts
index 98f0be2..8472182 100644
--- a/tests/server-api.test.ts
+++ b/tests/server-api.test.ts
@@ -1,6 +1,10 @@
 import type { FastifyInstance } from 'fastify';
 import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
 
+// buildApp() and checkDatabaseConnection() resolve the real createPrismaClient(),
+// which requires DATABASE_URL; the facade is mocked below, so no real database is used.
+const DUMMY_DATABASE_URL = 'postgresql://test:test@localhost:5432/dialog_survey_test';
+
 const { mockCronSchedule, scheduledTasks } = vi.hoisted(() => {
   const tasks: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
   return {
@@ -56,33 +60,12 @@ mockPrismaInstance = {
   },
 };
 
-vi.mock('@prisma/client', () => ({
-  PrismaClient: function FakePrismaClient() {
-    return mockPrismaInstance;
-  },
-}));
-
-vi.mock('../src/server.js', async (importOriginal) => {
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
   const original = (await importOriginal()) as Record<string, unknown>;
   return {
     ...original,
-    checkDatabaseConnection: async () => {
-      const { PrismaClient } = await import('@prisma/client');
-      const prisma = new PrismaClient();
-      const DB_CHECK_TIMEOUT_MS = 5000;
-      try {
-        await Promise.race([
-          prisma.$queryRaw`SELECT 1`,
-          new Promise((_, reject) =>
-            setTimeout(() => reject(new Error('Database connection timeout')), DB_CHECK_TIMEOUT_MS)
-          ),
-        ]);
-        return true;
-      } catch {
-        return false;
-      } finally {
-        await prisma.$disconnect();
-      }
+    PrismaClient: function FakePrismaClient() {
+      return mockPrismaInstance;
     },
   };
 });
@@ -100,6 +83,7 @@ describe('buildApp', () => {
     vi.stubEnv('SESSION_SALT', 'b'.repeat(32));
     vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
     vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
+    vi.stubEnv('DATABASE_URL', DUMMY_DATABASE_URL);
     const { buildApp } = await import('../src/server.js');
     app = await buildApp();
   });
@@ -197,6 +181,7 @@ describe('buildApp', () => {
 
 describe('checkDatabaseConnection', () => {
   beforeEach(() => {
+    vi.stubEnv('DATABASE_URL', DUMMY_DATABASE_URL);
     mockPrismaInstance = {
       $queryRaw: vi.fn(),
       $disconnect: vi.fn().mockResolvedValue(undefined),
@@ -250,6 +235,16 @@ describe('checkDatabaseConnection', () => {
     expect(mockPrismaInstance.$queryRaw).toHaveBeenCalledTimes(1);
     expect(mockPrismaInstance.$disconnect).toHaveBeenCalledTimes(1);
   });
+
+  it('should return false when the factory itself throws (no client to disconnect)', async () => {
+    const { checkDatabaseConnection } = await import('../src/server.js');
+    const result = await checkDatabaseConnection(() => {
+      throw new Error('DATABASE_URL is required to create a PrismaClient');
+    });
+
+    expect(result).toBe(false);
+    expect(mockPrismaInstance.$disconnect).not.toHaveBeenCalled();
+  });
 });
 
 // Regression test: startServer without DingTalk config exits cleanly
diff --git a/tests/server-lifecycle.test.ts b/tests/server-lifecycle.test.ts
index 52f3f5d..6db12a3 100644
--- a/tests/server-lifecycle.test.ts
+++ b/tests/server-lifecycle.test.ts
@@ -77,26 +77,30 @@ vi.mock('node-cron', () => ({
   },
 }));
 
-vi.mock('@prisma/client', () => ({
-  PrismaClient: function FakePrismaClient() {
-    return {
-      $disconnect: lifecycle.disconnect,
-      auditLog: { create: vi.fn().mockResolvedValue({}) },
-      interview: { findMany: vi.fn().mockResolvedValue([]) },
-      interviewPlan: {
-        create: vi.fn().mockResolvedValue({}),
-        findMany: vi.fn().mockResolvedValue([]),
-        findUnique: vi.fn().mockResolvedValue(null),
-      },
-      template: {
-        create: vi.fn().mockResolvedValue({}),
-        findMany: vi.fn().mockResolvedValue([]),
-        findUnique: vi.fn().mockResolvedValue(null),
-        update: vi.fn().mockResolvedValue({}),
-      },
-    };
-  },
-}));
+vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
+  const original = (await importOriginal()) as Record<string, unknown>;
+  return {
+    ...original,
+    PrismaClient: function FakePrismaClient() {
+      return {
+        $disconnect: lifecycle.disconnect,
+        auditLog: { create: vi.fn().mockResolvedValue({}) },
+        interview: { findMany: vi.fn().mockResolvedValue([]) },
+        interviewPlan: {
+          create: vi.fn().mockResolvedValue({}),
+          findMany: vi.fn().mockResolvedValue([]),
+          findUnique: vi.fn().mockResolvedValue(null),
+        },
+        template: {
+          create: vi.fn().mockResolvedValue({}),
+          findMany: vi.fn().mockResolvedValue([]),
+          findUnique: vi.fn().mockResolvedValue(null),
+          update: vi.fn().mockResolvedValue({}),
+        },
+      };
+    },
+  };
+});
 
 vi.mock('../src/services/audit-cleanup.service.js', () => ({
   AuditCleanupService: class FakeAuditCleanupService {
diff --git a/tests/state-integration.test.ts b/tests/state-integration.test.ts
index 4de3571..ba79e3b 100644
--- a/tests/state-integration.test.ts
+++ b/tests/state-integration.test.ts
@@ -1,10 +1,10 @@
-import type { PrismaClient } from '@prisma/client';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import type { InterviewState } from '../src/core/types/index.js';
 import {
   InterviewStateRepository,
   StatePersistenceError,
 } from '../src/repositories/interview-state.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 describe('InterviewStateRepository - Missing Coverage Tests', () => {
   let repository: InterviewStateRepository;
diff --git a/tests/state-persistence.test.ts b/tests/state-persistence.test.ts
index 1e856ff..d9163de 100644
--- a/tests/state-persistence.test.ts
+++ b/tests/state-persistence.test.ts
@@ -1,9 +1,9 @@
-import type { PrismaClient } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   InterviewStateRepository,
   StatePersistenceError,
 } from '../src/repositories/interview-state.repository.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 
 describe('InterviewStateRepository', () => {
   let repository: InterviewStateRepository;
diff --git a/tests/template-crud.test.ts b/tests/template-crud.test.ts
index b2068e2..92423af 100644
--- a/tests/template-crud.test.ts
+++ b/tests/template-crud.test.ts
@@ -1,6 +1,6 @@
-import { type PrismaClient, TemplateStatus } from '@prisma/client';
 import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { TemplateRepository } from '../src/repositories/template.repository.js';
+import { type PrismaClient, TemplateStatus } from '../src/utils/prisma-client.js';
 
 const mockTemplate = (overrides = {}) => ({
   id: 'tpl-123',
diff --git a/tests/template-dimensions-api.test.ts b/tests/template-dimensions-api.test.ts
index 82413b1..9113a94 100644
--- a/tests/template-dimensions-api.test.ts
+++ b/tests/template-dimensions-api.test.ts
@@ -1,8 +1,13 @@
-import { PrismaClient } from '@prisma/client';
-import { afterAll, describe, expect, it } from 'vitest';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
 import { updateTemplateDimensions } from '../src/services/template-dimension.service.js';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Template Dimension Service', () => {
   /** @test REQ-TEMPLATE-001 @intent verify valid dimensions can be saved @covers AC-TEMPLATE-001-01 */
diff --git a/tests/template-import-export.test.ts b/tests/template-import-export.test.ts
index 35fcc20..9eb19ff 100644
--- a/tests/template-import-export.test.ts
+++ b/tests/template-import-export.test.ts
@@ -1,5 +1,5 @@
-import { TemplateStatus } from '@prisma/client';
 import { beforeEach, describe, expect, it } from 'vitest';
+import { TemplateStatus } from '../src/utils/prisma-client.js';
 
 let idCounter = 0;
 const generateId = () => `tmpl-${Date.now()}-${++idCounter}`;
diff --git a/tests/template-version.test.ts b/tests/template-version.test.ts
index f040753..9f623fd 100644
--- a/tests/template-version.test.ts
+++ b/tests/template-version.test.ts
@@ -1,5 +1,5 @@
-import { TemplateStatus } from '@prisma/client';
 import { beforeEach, describe, expect, it } from 'vitest';
+import { TemplateStatus } from '../src/utils/prisma-client.js';
 
 let idCounter = 0;
 const generateId = () => `tmpl-${Date.now()}-${++idCounter}`;
diff --git a/tests/templates-api.test.ts b/tests/templates-api.test.ts
index 046ce64..6335c64 100644
--- a/tests/templates-api.test.ts
+++ b/tests/templates-api.test.ts
@@ -1,9 +1,10 @@
-import { PrismaClient, TemplateStatus } from '@prisma/client';
 import type { FastifyInstance } from 'fastify';
 import Fastify from 'fastify';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
 import { templateRoutes } from '../src/api/templates.js';
 import { TemplateRepository } from '../src/repositories/template.repository.js';
+import { type PrismaClient, TemplateStatus } from '../src/utils/prisma-client.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -12,7 +13,11 @@ vi.mock('../src/utils/logger.js', () => ({
   debug: vi.fn(),
 }));
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 describe('Template API Endpoints', () => {
   let fastify: FastifyInstance;
diff --git a/tests/test-database.test.ts b/tests/test-database.test.ts
new file mode 100644
index 0000000..beadc79
--- /dev/null
+++ b/tests/test-database.test.ts
@@ -0,0 +1,24 @@
+import { describe, expect, it } from 'vitest';
+import { TestDatabase } from './helpers/test-db.js';
+
+/**
+ * @test REQ-PRISMA7-002
+ * @intent teardown → cleanup order contract: cleanup after teardown is a
+ *   silent no-op via the synchronous isClosed guard (DD-005)
+ * @covers AC-PRISMA7-002-01
+ */
+describe('TestDatabase cleanup/teardown contract', () => {
+  it('cleanup after teardown resolves silently without touching the database', async () => {
+    const testDb = new TestDatabase();
+
+    await testDb.teardown();
+    await expect(testDb.cleanup({ templates: ['never-persisted'] })).resolves.toBeUndefined();
+  });
+
+  it('teardown is idempotent', async () => {
+    const testDb = new TestDatabase();
+
+    await testDb.teardown();
+    await expect(testDb.teardown()).resolves.toBeUndefined();
+  });
+});
diff --git a/tests/workflow-interview-lifecycle.test.ts b/tests/workflow-interview-lifecycle.test.ts
index 9d5ac1e..771a6e3 100644
--- a/tests/workflow-interview-lifecycle.test.ts
+++ b/tests/workflow-interview-lifecycle.test.ts
@@ -1,6 +1,7 @@
-import { PrismaClient } from '@prisma/client';
 import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
+import type { PrismaClient } from '../src/utils/prisma-client.js';
 import { registerTestAdminAuth } from './helpers/admin-auth.js';
+import { getSharedTestPrisma } from './helpers/create-test-prisma.js';
 
 vi.mock('../src/utils/logger.js', () => ({
   info: vi.fn(),
@@ -139,7 +140,11 @@ async function createAnalysisApp() {
   return app;
 }
 
-const prisma = new PrismaClient();
+let prisma: PrismaClient;
+
+beforeAll(async () => {
+  prisma = await getSharedTestPrisma();
+});
 
 // ---------------------------------------------------------------------------
 // Shared fixture state for Scenario 2 — populated once per suite run
