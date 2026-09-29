import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '../../src/utils/prisma-client.js';
import { createTestPglite } from './pglite-template.js';

async function buildClient(): Promise<PrismaClient> {
  const pglite = await createTestPglite();
  return new PrismaClient({ adapter: new PrismaPGlite(pglite) });
}

let shared: Promise<PrismaClient> | undefined;

/**
 * File-level singleton: repeated calls within one test file share one PGlite
 * database and one client (promise-memoized, so concurrent first calls boot a
 * single instance). Disconnect ownership belongs to the importing test file's
 * `afterAll` / `TestDatabase.teardown()`; module isolation is per test file.
 * `$disconnect()` only disposes the (no-op) adapter — the in-memory PGlite is
 * reclaimed when the per-file worker process exits.
 */
export async function getSharedTestPrisma(): Promise<PrismaClient> {
  shared ??= buildClient();
  return shared;
}

/**
 * Independent instance backed by its own PGlite database; the caller owns
 * `$disconnect()` (which, as above, does not release the PGlite — process exit
 * does).
 */
export async function createTestPrisma(): Promise<PrismaClient> {
  return buildClient();
}
