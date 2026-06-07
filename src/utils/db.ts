import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

/**
 * Get or create the singleton PrismaClient instance.
 * Use sparingly — prefer DI (constructor injection) for most cases.
 * This exists for fire-and-forget background tasks (e.g., analyzingNode)
 * where threading DI through the graph would be excessive.
 */
export function getDb(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export async function shutdownDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}