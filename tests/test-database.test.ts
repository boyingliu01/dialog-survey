import { describe, expect, it } from 'vitest';
import { TestDatabase } from './helpers/test-db.js';

/**
 * @test REQ-PRISMA7-002
 * @intent teardown → cleanup order contract: cleanup after teardown is a
 *   silent no-op via the synchronous isClosed guard (DD-005)
 * @covers AC-PRISMA7-002-01
 */
describe('TestDatabase cleanup/teardown contract', () => {
  it('cleanup after teardown resolves silently without touching the database', async () => {
    const testDb = new TestDatabase();

    await testDb.teardown();
    await expect(testDb.cleanup({ templates: ['never-persisted'] })).resolves.toBeUndefined();
  });

  it('teardown is idempotent', async () => {
    const testDb = new TestDatabase();

    await testDb.teardown();
    await expect(testDb.teardown()).resolves.toBeUndefined();
  });
});
