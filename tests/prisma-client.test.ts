import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient as GeneratedClient } from '../src/generated/prisma/client.js';
import type { PrismaClient as FacadeClient } from '../src/utils/prisma-client.js';

const EXPECTED_ENUMS = {
  InterviewStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    PROCESSING: 'PROCESSING',
    WAITING: 'WAITING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
  SendStatus: { NOT_SENT: 'NOT_SENT', SENT: 'SENT', FAILED: 'FAILED', DELIVERED: 'DELIVERED' },
  TemplateStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' },
  PlanStatus: {
    PENDING: 'PENDING',
    READY: 'READY',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
  BatchReportStatus: {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
  BatchReportType: { SUMMARY: 'SUMMARY', COMPARISON: 'COMPARISON', TREND: 'TREND' },
} as const;

/**
 * @test REQ-PRISMA7-001
 * @intent 门面模块（src/utils/prisma-client.ts）契约：PrismaClient 与 6 枚 schema 枚举经门面可用、
 *         Prisma 命名空间类型符号可用、与生成目录类型同一，且模块求值期零副作用
 * @covers AC-PRISMA7-001-02
 */
describe('prisma-client facade (DD-003)', () => {
  it('re-exports PrismaClient as a constructor', async () => {
    const mod = await import('../src/utils/prisma-client.js');
    expect(typeof mod.PrismaClient).toBe('function');
  });

  it('re-exports all six schema enums with the expected members', async () => {
    const mod = await import('../src/utils/prisma-client.js');
    for (const [enumName, members] of Object.entries(EXPECTED_ENUMS)) {
      const actual = (mod as Record<string, unknown>)[enumName];
      expect(actual, `${enumName} must be exported by the facade`).toBeDefined();
      for (const [member, value] of Object.entries(members)) {
        expect((actual as Record<string, string>)[member], `${enumName}.${member}`).toBe(value);
      }
    }
  });

  it('exposes the Prisma namespace types (compile-time usage)', async () => {
    const { PrismaClient } = await import('../src/utils/prisma-client.js');
    const json = { dimension: 'clarity' } satisfies import(
      '../src/utils/prisma-client.js'
    ).Prisma.InputJsonValue;
    const update: import('../src/utils/prisma-client.js').Prisma.InterviewPlanUpdateInput = {
      name: 'typed-by-facade',
    };
    function applyUpdate(
      tx: import('../src/utils/prisma-client.js').Prisma.TransactionClient
    ): string {
      return typeof tx.interviewPlan.update === 'function' ? 'ok' : 'unexpected';
    }
    expect(typeof PrismaClient).toBe('function');
    expect(json).toEqual({ dimension: 'clarity' });
    expect(update).toEqual({ name: 'typed-by-facade' });
    expect(applyUpdate).toBeTypeOf('function');
  });

  it('is type-identical to the generated client path (DD-003 hard rule)', async () => {
    // bidirectional identity — only compiles if both paths expose the same PrismaClient type
    const facadeToGenerated: (c: FacadeClient) => GeneratedClient = (c) => c;
    const generatedToFacade: (c: GeneratedClient) => FacadeClient = (c) => c;
    const { createPrismaClient } = await import('../src/utils/prisma-factory.js');
    const client: FacadeClient = createPrismaClient({
      connectionString: 'postgresql://identity:identity@127.0.0.1:59999/never_connected',
    });
    const asGenerated: GeneratedClient = facadeToGenerated(client);
    expect(asGenerated).toBe(client);
    expect(generatedToFacade(asGenerated)).toBe(client);
    await client.$disconnect();
  });

  it('has zero evaluation-time side effects when DATABASE_URL is absent', async () => {
    const saved = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    vi.resetModules();
    try {
      const mod = await import('../src/utils/prisma-client.js');
      expect(typeof mod.PrismaClient).toBe('function');
      expect(mod.InterviewStatus.PENDING).toBe('PENDING');
    } finally {
      if (saved === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = saved;
      }
    }
  });
});
