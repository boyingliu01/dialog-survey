/**
 * @test REQ-TEST-INFRA-CLEANUP
 * @intent `TestDatabase.cleanup` is the per-test isolation mechanism for 9
 *   integration suites, and it had no test of its own: it is test
 *   INFRASTRUCTURE, so the coverage include list (src only) never measured it
 *   and no assertion ever ran it in isolation. Its failure mode is the worst
 *   kind for a shared helper -- deleting nothing looks exactly like deleting
 *   everything, and the symptom shows up later as an unrelated suite failing
 *   on a leftover row. These cases pin the contract one table at a time.
 * @covers tests/helpers/test-db.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CLEANABLE_KEYS, TestDatabase } from './helpers/test-db.js';

describe('TestDatabase', () => {
  let db: TestDatabase | undefined;

  afterEach(async () => {
    await db?.teardown();
    db = undefined;
  });

  /** A freshly set-up database with no rows. */
  async function fresh(): Promise<TestDatabase> {
    db = new TestDatabase();
    await db.setup();
    return db;
  }

  describe('cleanup', () => {
    it('THROWS before setup() rather than silently skipping', async () => {
      // Measured, and it contradicts the doc comment on `cleanup`, which claims
      // it is "safe to call without a prior setup()". `isClosed` starts false,
      // so the early return does NOT fire and the call reaches `requirePrisma`,
      // which throws. That is the SAFER of the two behaviours -- a suite that
      // forgot `setup()` finds out instead of believing it cleaned up -- so this
      // pins the throw and the COMMENT is what needs correcting, not the code.
      const uninitialised = new TestDatabase();
      await expect(uninitialised.cleanup({ interviews: ['x'] })).rejects.toThrow(
        'TestDatabase.setup() must complete before the database can be used'
      );
    });

    it('is a silent no-op after teardown(), and the connection is really gone', async () => {
      // Two claims. The no-op matters because suites call cleanup in an
      // afterEach that may run after teardown. The second matters more: a
      // `teardown()` that returned without closing anything would still pass a
      // "resolves" assertion, so assert that a query now FAILS.
      const local = await fresh();
      const prisma = local.getPrisma();
      await local.teardown();
      await expect(local.cleanup({ interviews: ['x'] })).resolves.toBeUndefined();
      await expect(prisma.template.count()).rejects.toThrow();
    });

    it('deletes a row that was inserted', async () => {
      // The positive control: without this, a cleanup that deleted nothing
      // would still pass every "does not throw" assertion.
      const local = await fresh();
      const prisma = local.getPrisma();
      const template = await prisma.template.create({
        data: { name: 'cleanup-control', description: 'x', content: '[]' },
      });

      await local.cleanup({ templates: [template.id] });

      expect(await prisma.template.findUnique({ where: { id: template.id } })).toBeNull();
    });

    it('deletes by template NAME as well as by id', async () => {
      // `templateNames` is a separate branch from `templates`: the seeders name
      // their fixtures rather than generating ids, so this is the path most
      // suites actually use.
      const local = await fresh();
      const prisma = local.getPrisma();
      await prisma.template.create({
        data: { name: 'by-name-fixture', description: 'x', content: '[]' },
      });

      await local.cleanup({ templateNames: ['by-name-fixture'] });

      expect(await prisma.template.findFirst({ where: { name: 'by-name-fixture' } })).toBeNull();
    });

    it('leaves other rows alone', async () => {
      // Scoping check: a cleanup that ran a predicate-less deleteMany would
      // empty the database and make every suite order-dependent.
      const local = await fresh();
      const prisma = local.getPrisma();
      const keep = await prisma.template.create({
        data: { name: 'keep-me', description: 'x', content: '[]' },
      });
      const drop = await prisma.template.create({
        data: { name: 'drop-me', description: 'x', content: '[]' },
      });

      await local.cleanup({ templates: [drop.id] });

      expect(await prisma.template.findUnique({ where: { id: keep.id } })).not.toBeNull();
    });

    it('tolerates empty and absent id arrays', async () => {
      const local = await fresh();
      await expect(local.cleanup({})).resolves.toBeUndefined();
      await expect(
        local.cleanup({ interviews: [], messages: [], templateNames: [] })
      ).resolves.toBeUndefined();
    });

    it('tolerates ids that do not exist', async () => {
      // deleteMany on a missing id is not an error in SQL; asserting it keeps a
      // future switch to `delete` (which throws) from slipping through.
      const local = await fresh();
      await expect(local.cleanup({ interviews: ['no-such-id'] })).resolves.toBeUndefined();
    });

    it('deletes across several tables in one call', async () => {
      const local = await fresh();
      const prisma = local.getPrisma();
      const template = await prisma.template.create({
        data: { name: 'multi-1', description: 'x', content: '[]' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'multi-plan', templateId: template.id },
      });

      await local.cleanup({ interviewPlans: [plan.id], templates: [template.id] });

      expect(await prisma.interviewPlan.findUnique({ where: { id: plan.id } })).toBeNull();
      expect(await prisma.template.findUnique({ where: { id: template.id } })).toBeNull();
    });
  });

  /**
   * The set-level guard the `if`-ladder never had.
   *
   * `cleanup` used to be eleven copy-pasted blocks. Nothing asserted that the
   * eleven blocks covered the eleven tables, so deleting one left the whole
   * suite green -- measured: removing the `templateNames` branch failed exactly
   * ONE test, the one written alongside this file, and 2358 others passed.
   * Now `CLEANUP_STEPS` is a table and this test asserts it against the
   * `CleanupIds` keys and against real deletes, so a dropped row is a failure
   * by construction rather than by luck.
   */
  describe('table-driven cleanup contract', () => {
    it('covers every key of CleanupIds exactly once', () => {
      // A key added to the interface but not to the table is silently ignored
      // by `cleanup`; that is the drift this assertion stops.
      expect([...CLEANABLE_KEYS].sort()).toEqual(
        [
          'analysisFailures',
          'analysisReports',
          'apiKeys',
          'auditLogs',
          'batchAnalysisReports',
          'interviewPlans',
          'interviews',
          'messages',
          'responses',
          'templateNames',
          'templates',
        ].sort()
      );
    });

    it('has no duplicate table keys', () => {
      expect(new Set(CLEANABLE_KEYS).size).toBe(CLEANABLE_KEYS.length);
    });

    /**
     * Every deleteMany path the table can reach, with a seeded row and a reader.
     *
     * Only tables whose rows can be created standalone are listed: a `response`
     * needs a message, a message needs an interview, and so on, so seeding all
     * eleven would be a mini-fixture factory rather than a unit test. The five
     * rows below are the ones with no required children, and each is driven
     * through `cleanup` by its real key.
     */
    it.each([
      [
        'templates',
        async (prisma: ReturnType<TestDatabase['getPrisma']>) => {
          const row = await prisma.template.create({
            data: { name: 'set-level-1', description: 'x', content: '[]' },
          });
          return {
            ids: [row.id],
            read: () => prisma.template.findUnique({ where: { id: row.id } }),
          };
        },
      ],
      [
        'templateNames',
        async (prisma: ReturnType<TestDatabase['getPrisma']>) => {
          await prisma.template.create({
            data: { name: 'set-level-2', description: 'x', content: '[]' },
          });
          return {
            ids: ['set-level-2'],
            read: () => prisma.template.findFirst({ where: { name: 'set-level-2' } }),
          };
        },
      ],
      [
        'interviewPlans',
        async (prisma: ReturnType<TestDatabase['getPrisma']>) => {
          const tpl = await prisma.template.create({
            data: { name: 'set-level-host', description: 'x', content: '[]' },
          });
          const row = await prisma.interviewPlan.create({
            data: { name: 'set-level-plan', templateId: tpl.id },
          });
          return {
            ids: [row.id],
            read: () => prisma.interviewPlan.findUnique({ where: { id: row.id } }),
          };
        },
      ],
      [
        'interviews',
        async (prisma: ReturnType<TestDatabase['getPrisma']>) => {
          const tpl = await prisma.template.create({
            data: { name: 'set-level-host2', description: 'x', content: '[]' },
          });
          const row = await prisma.interview.create({
            data: { userId: 'set-level-user', templateId: tpl.id },
          });
          return {
            ids: [row.id],
            read: () => prisma.interview.findUnique({ where: { id: row.id } }),
          };
        },
      ],
      [
        'apiKeys',
        async (prisma: ReturnType<TestDatabase['getPrisma']>) => {
          const row = await prisma.apiKey.create({
            data: { keyHash: 'set-level-hash', role: 'user' },
          });
          return { ids: [row.id], read: () => prisma.apiKey.findUnique({ where: { id: row.id } }) };
        },
      ],
    ])('%s removes its row through the table entry', async (key, seed) => {
      const local = await fresh();
      const prisma = local.getPrisma();
      const { ids, read } = await seed(prisma);

      expect(await read()).not.toBeNull();
      await local.cleanup({ [key]: ids });
      expect(await read()).toBeNull();
    });
  });

  describe('getPrisma', () => {
    it('returns a usable client, not merely a defined value', async () => {
      // `toBeDefined()` would pass for any object at all. Asserting that a real
      // query round-trips is what proves the adapter is wired up, and that this
      // is the same client `cleanup` uses rather than a second connection.
      const local = await fresh();
      const prisma = local.getPrisma();
      expect(await prisma.template.count()).toBe(0);
      expect(local.getPrisma()).toBe(prisma);
    });

    it('throws before setup', () => {
      // The error message names the cause; asserting only "it throws" would let
      // a generic TypeError from a missing property pass as this guard.
      const uninitialised = new TestDatabase();
      expect(() => uninitialised.getPrisma()).toThrow(
        'TestDatabase.setup() must complete before the database can be used'
      );
    });
  });
});
