import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';

// createPrismaClient() requires DATABASE_URL; this file never reaches a real
// database (facade is mocked below), so any well-formed URL satisfies it.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');

// Partial mock: real facade symbols (types/enums) + constructible mock class,
// so `new PrismaClient()` from the facade stays callable inside this file.
vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
  class MockPrismaClient {
    $disconnect = vi.fn();
    $connect = vi.fn();
  }
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, PrismaClient: MockPrismaClient };
});

describe('getDb', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a PrismaClient instance', async () => {
    const { getDb, shutdownDb } = await import('../src/utils/db.js');
    const db = getDb();
    expect(db).toBeDefined();
    expect(db).toHaveProperty('$disconnect');
    await shutdownDb();
  });

  it('should return the same instance on subsequent calls', async () => {
    const { getDb, shutdownDb } = await import('../src/utils/db.js');
    const first = getDb();
    const second = getDb();
    expect(first).toBe(second);
    await shutdownDb();
  });

  it('should create a new instance after shutdown', async () => {
    const { getDb, shutdownDb } = await import('../src/utils/db.js');
    const first = getDb();
    await shutdownDb();
    const second = getDb();
    expect(first).not.toBe(second);
    await shutdownDb();
  });
});

describe('shutdownDb', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should safely do nothing when no instance exists', async () => {
    const { shutdownDb } = await import('../src/utils/db.js');
    // After resetModules, _prisma is null
    // Call shutdown without ever calling getDb
    await expect(shutdownDb()).resolves.toBeUndefined();
  });

  it('should disconnect and reset the singleton', async () => {
    const { getDb, shutdownDb } = await import('../src/utils/db.js');
    const db = getDb() as PrismaClient;
    await shutdownDb();
    expect(db.$disconnect).toHaveBeenCalled();
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
});
