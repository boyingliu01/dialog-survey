import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/utils/prisma-client.js';

function resolveTestDatabaseUrl(): string {
  return (
    process.env['TEST_DATABASE_URL'] ||
    process.env['DATABASE_URL'] ||
    'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test'
  );
}

function buildClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: resolveTestDatabaseUrl(),
    connectionTimeoutMillis: 5000,
  });
  return new PrismaClient({ adapter });
}

let shared: PrismaClient | undefined;

/**
 * File-level singleton: repeated calls within one test file share one instance
 * (and, from Stage B on, one PGlite database). Disconnect ownership belongs to
 * `afterAll` / `TestDatabase.teardown()`.
 */
export async function getSharedTestPrisma(): Promise<PrismaClient> {
  shared ??= buildClient();
  return shared;
}

/**
 * Independent instance for genuinely isolated scenarios; the caller owns
 * `$disconnect()`.
 */
export async function createTestPrisma(): Promise<PrismaClient> {
  return buildClient();
}
