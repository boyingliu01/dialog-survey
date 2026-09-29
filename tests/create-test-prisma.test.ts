import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { createTestPrisma, getSharedTestPrisma } from './helpers/create-test-prisma.js';

/**
 * @test REQ-PRISMA7-002
 * @intent create-test-prisma helper contract: file-level singleton vs
 *   independent instance, both usable for real queries
 * @covers AC-PRISMA7-002-01
 */
describe('create-test-prisma helper', () => {
  let shared: PrismaClient;

  beforeAll(async () => {
    shared = await getSharedTestPrisma();
  });

  afterAll(async () => {
    await shared.$disconnect();
  });

  it('getSharedTestPrisma returns the same instance on repeated calls', async () => {
    const again = await getSharedTestPrisma();
    expect(again).toBe(shared);
  });

  it('shared instance serves real queries', async () => {
    const rows = await shared.$queryRaw`SELECT 1 AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('createTestPrisma returns an independent instance that the caller can disconnect', async () => {
    const isolated = await createTestPrisma();
    expect(isolated).not.toBe(shared);

    const rows = await isolated.$queryRaw`SELECT 1 AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);

    await isolated.$disconnect();

    const stillAlive = await shared.$queryRaw`SELECT 1 AS ok`;
    expect(stillAlive).toEqual([{ ok: 1 }]);
  });
});
