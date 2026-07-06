import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

export class TestDatabase {
  private prisma: PrismaClient;
  private databaseUrl: string;

  constructor() {
    this.databaseUrl =
      process.env['TEST_DATABASE_URL'] ||
      'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test';

    process.env['DATABASE_URL'] = this.databaseUrl;
    this.prisma = new PrismaClient();
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

  async teardown(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async cleanup(ids: {
    responses?: string[];
    messages?: string[];
    analysisReports?: string[];
    analysisFailures?: string[];
    batchAnalysisReports?: string[];
    interviews?: string[];
    interviewPlans?: string[];
    templates?: string[];
    auditLogs?: string[];
    apiKeys?: string[];
  }): Promise<void> {
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
