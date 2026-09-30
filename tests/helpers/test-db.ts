import type { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '../../src/utils/prisma-client.js';
import { createTestPglite } from './pglite-template.js';

/**
 * In-memory PGlite database for integration-style tests — no PostgreSQL
 * process, no `DATABASE_URL`. Each instance owns its own database.
 */
export class TestDatabase {
  private prisma: PrismaClient | undefined;
  private pglite: PGlite | undefined;
  private isClosed = false;

  async setup(): Promise<void> {
    const pglite = await createTestPglite();
    this.pglite = pglite;
    this.prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  }

  /**
   * Order contract: `isClosed` is set synchronously before any await, so a
   * concurrent `cleanup()` can only hit its early-exit branch. After teardown,
   * `cleanup()` is a silent no-op. Safe to call without a prior `setup()`.
   */
  async teardown(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    await this.prisma?.$disconnect();
    await this.pglite?.close();
  }

  /**
   * Deletes rows for the given ids (per-test isolation). Silent no-op after
   * `teardown()` (see order contract above); before teardown it throws when
   * the database is unreachable.
   */
  async cleanup(ids: {
    responses?: string[];
    messages?: string[];
    analysisReports?: string[];
    analysisFailures?: string[];
    batchAnalysisReports?: string[];
    interviews?: string[];
    interviewPlans?: string[];
    templates?: string[];
    templateNames?: string[];
    auditLogs?: string[];
    apiKeys?: string[];
  }): Promise<void> {
    if (this.isClosed) return;
    const prisma = this.requirePrisma();
    if (ids.responses?.length) {
      await prisma.response.deleteMany({ where: { id: { in: ids.responses } } });
    }
    if (ids.messages?.length) {
      await prisma.message.deleteMany({ where: { id: { in: ids.messages } } });
    }
    if (ids.analysisReports?.length) {
      await prisma.analysisReport.deleteMany({ where: { id: { in: ids.analysisReports } } });
    }
    if (ids.analysisFailures?.length) {
      await prisma.analysisFailure.deleteMany({ where: { id: { in: ids.analysisFailures } } });
    }
    if (ids.batchAnalysisReports?.length) {
      await prisma.batchAnalysisReport.deleteMany({
        where: { id: { in: ids.batchAnalysisReports } },
      });
    }
    if (ids.interviews?.length) {
      await prisma.interview.deleteMany({ where: { id: { in: ids.interviews } } });
    }
    if (ids.interviewPlans?.length) {
      await prisma.interviewPlan.deleteMany({ where: { id: { in: ids.interviewPlans } } });
    }
    if (ids.templates?.length) {
      await prisma.template.deleteMany({ where: { id: { in: ids.templates } } });
    }
    if (ids.templateNames?.length) {
      await prisma.template.deleteMany({ where: { name: { in: ids.templateNames } } });
    }
    if (ids.auditLogs?.length) {
      await prisma.auditLog.deleteMany({ where: { id: { in: ids.auditLogs } } });
    }
    if (ids.apiKeys?.length) {
      await prisma.apiKey.deleteMany({ where: { id: { in: ids.apiKeys } } });
    }
  }

  getPrisma(): PrismaClient {
    return this.requirePrisma();
  }

  private requirePrisma(): PrismaClient {
    if (!this.prisma) {
      throw new Error('TestDatabase.setup() must complete before the database can be used');
    }
    return this.prisma;
  }
}
