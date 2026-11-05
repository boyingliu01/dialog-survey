import type { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '../../src/utils/prisma-client.js';
import { createTestPglite } from './pglite-template.js';

/** Ids to delete, grouped by the table they belong to. */
export interface CleanupIds {
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
}

/** One row per cleanable table: where its ids come from, and how to delete them. */
interface CleanupStep {
  /** Key in `CleanupIds` that carries this table's ids. */
  readonly key: keyof CleanupIds;
  /** Delete the rows whose ids (or names) are in `ids`. */
  readonly remove: (prisma: PrismaClient, ids: string[]) => Promise<unknown>;
}

/**
 * The cleanable tables, in deletion order.
 *
 * This is a TABLE rather than eleven `if` blocks because the blocks were
 * identical in shape and the shape is the point: the previous version scored
 * CCN 13 purely by accumulation, and — more importantly — a table can be
 * asserted as a SET. `tests/test-db-helper.test.ts` walks it and proves every
 * row actually deletes something, which a hand-written `if` ladder cannot do
 * without eleven copy-pasted cases. Measured: deleting one block from the
 * ladder left the whole suite green, because nothing ever checked that the
 * eleven branches matched the eleven tables.
 *
 * Children precede parents so a delete never trips a foreign key.
 */
const CLEANUP_STEPS: readonly CleanupStep[] = [
  { key: 'responses', remove: (p, ids) => p.response.deleteMany({ where: { id: { in: ids } } }) },
  { key: 'messages', remove: (p, ids) => p.message.deleteMany({ where: { id: { in: ids } } }) },
  {
    key: 'analysisReports',
    remove: (p, ids) => p.analysisReport.deleteMany({ where: { id: { in: ids } } }),
  },
  {
    key: 'analysisFailures',
    remove: (p, ids) => p.analysisFailure.deleteMany({ where: { id: { in: ids } } }),
  },
  {
    key: 'batchAnalysisReports',
    remove: (p, ids) => p.batchAnalysisReport.deleteMany({ where: { id: { in: ids } } }),
  },
  { key: 'interviews', remove: (p, ids) => p.interview.deleteMany({ where: { id: { in: ids } } }) },
  {
    key: 'interviewPlans',
    remove: (p, ids) => p.interviewPlan.deleteMany({ where: { id: { in: ids } } }),
  },
  { key: 'templates', remove: (p, ids) => p.template.deleteMany({ where: { id: { in: ids } } }) },
  // Names, not ids: several suites seed by name rather than generating an id.
  {
    key: 'templateNames',
    remove: (p, ids) => p.template.deleteMany({ where: { name: { in: ids } } }),
  },
  { key: 'auditLogs', remove: (p, ids) => p.auditLog.deleteMany({ where: { id: { in: ids } } }) },
  { key: 'apiKeys', remove: (p, ids) => p.apiKey.deleteMany({ where: { id: { in: ids } } }) },
];

/** The cleanable table keys, exported so a test can assert the set. */
export const CLEANABLE_KEYS: readonly (keyof CleanupIds)[] = CLEANUP_STEPS.map((s) => s.key);

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
  /**
   * Deletes rows for the given ids (per-test isolation).
   *
   * After `teardown()` this is a silent no-op. Before `setup()` it THROWS
   * ("must complete before the database can be used"), which is deliberate: a
   * suite that forgot `setup()` should find out rather than believe it cleaned
   * up. (The doc comment here used to claim the never-set-up call was safe too;
   * `tests/test-db-helper.test.ts` measures it and pins the throw.)
   */
  async cleanup(ids: CleanupIds): Promise<void> {
    if (this.isClosed) return;
    const prisma = this.requirePrisma();
    for (const step of CLEANUP_STEPS) {
      const values = ids[step.key];
      if (values?.length) {
        await step.remove(prisma, values);
      }
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
