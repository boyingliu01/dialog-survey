import type { PrismaClient } from './prisma-client.js';
import { createPrismaClient } from './prisma-factory.js';

let _prisma: PrismaClient | null = null;

/**
 * Get or create the singleton PrismaClient instance.
 * Use sparingly — prefer DI (constructor injection) for most cases.
 * This exists for fire-and-forget background tasks (e.g., analyzingNode)
 * where threading DI through the graph would be excessive.
 *
 * Delegates construction to createPrismaClient(), so it fails loudly when
 * DATABASE_URL is missing instead of building a half-configured client.
 */
export function getDb(): PrismaClient {
  if (!_prisma) {
    _prisma = createPrismaClient();
  }
  return _prisma;
}

export async function shutdownDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
