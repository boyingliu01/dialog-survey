import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseHealthRepository } from '../src/repositories/database-health.repository.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DatabaseHealthRepository', () => {
  it('reports ok with a latency measurement on a healthy database', async () => {
    const repo = new DatabaseHealthRepository(prisma);
    const result = await repo.check();
    expect(result.status).toBe('ok');
    expect(result.error).toBeUndefined();
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports error with the failure message when the database is unreachable', async () => {
    // A repository bound to a client whose connection is unusable. The raw
    // query must fail and the probe must swallow the error into a structured
    // result instead of throwing.
    const broken = Object.create(prisma) as PrismaClient;
    Object.defineProperty(broken, '$queryRaw', {
      value: () => {
        throw new Error('boom: connection refused');
      },
    });
    const repo = new DatabaseHealthRepository(broken);
    const result = await repo.check();
    expect(result.status).toBe('error');
    expect(result.error).toBe('boom: connection refused');
    expect(result.latencyMs).toBeUndefined();
  });
});
