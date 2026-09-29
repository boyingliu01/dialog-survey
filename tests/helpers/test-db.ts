import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/utils/prisma-client.js';
import { PRISMA_CONNECT_TIMEOUT_MS } from '../../src/utils/prisma-factory.js';

export class TestDatabase {
  private readonly prisma: PrismaClient;
  private readonly databaseUrl: string;
  private readonly previousDatabaseUrl: string | undefined;
  private isClosed = false;

  constructor() {
    this.previousDatabaseUrl = process.env['DATABASE_URL'];
    this.databaseUrl =
      process.env['TEST_DATABASE_URL'] ||
      'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test';

    process.env['DATABASE_URL'] = this.databaseUrl;
    const adapter = new PrismaPg({
      connectionString: this.databaseUrl,
      connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
    });
    this.prisma = new PrismaClient({ adapter });
  }

  async setup(): Promise<void> {
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: this.databaseUrl },
      });
    } catch (_error) {
      try {
        execSync('npx prisma db push --accept-data-loss', {
          stdio: 'pipe',
          env: { ...process.env, DATABASE_URL: this.databaseUrl },
        });
      } catch (pushError) {
        throw new Error(
          `Failed to setup test database schema: ${pushError instanceof Error ? pushError.message : String(pushError)}`
        );
      }
    }
  }

  /**
   * Order contract: `isClosed` is set synchronously before any await, so a
   * concurrent `cleanup()` can only hit its early-exit branch. After teardown,
   * `cleanup()` is a silent no-op. Callers must not call `cleanup()` first and
   * expect it to persist anything — it only deletes rows listed in `ids`.
   */
  async teardown(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      await this.prisma.$disconnect();
    } finally {
      if (this.previousDatabaseUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = this.previousDatabaseUrl;
      }
    }
  }

  /**
   * Deletes rows for the given ids (per-test isolation). Silent no-op after
   * `teardown()` (see order contract above); before teardown it throws when the
   * database is unreachable.
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
    if (ids.responses?.length) {
      await this.prisma.response.deleteMany({ where: { id: { in: ids.responses } } });
    }
    if (ids.messages?.length) {
      await this.prisma.message.deleteMany({ where: { id: { in: ids.messages } } });
    }
    if (ids.analysisReports?.length) {
      await this.prisma.analysisReport.deleteMany({ where: { id: { in: ids.analysisReports } } });
    }
    if (ids.analysisFailures?.length) {
      await this.prisma.analysisFailure.deleteMany({ where: { id: { in: ids.analysisFailures } } });
    }
    if (ids.batchAnalysisReports?.length) {
      await this.prisma.batchAnalysisReport.deleteMany({
        where: { id: { in: ids.batchAnalysisReports } },
      });
    }
    if (ids.interviews?.length) {
      await this.prisma.interview.deleteMany({ where: { id: { in: ids.interviews } } });
    }
    if (ids.interviewPlans?.length) {
      await this.prisma.interviewPlan.deleteMany({ where: { id: { in: ids.interviewPlans } } });
    }
    if (ids.templates?.length) {
      await this.prisma.template.deleteMany({ where: { id: { in: ids.templates } } });
    }
    if (ids.templateNames?.length) {
      await this.prisma.template.deleteMany({ where: { name: { in: ids.templateNames } } });
    }
    if (ids.auditLogs?.length) {
      await this.prisma.auditLog.deleteMany({ where: { id: { in: ids.auditLogs } } });
    }
    if (ids.apiKeys?.length) {
      await this.prisma.apiKey.deleteMany({ where: { id: { in: ids.apiKeys } } });
    }
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  getDatabaseUrl(): string {
    return this.databaseUrl;
  }
}
