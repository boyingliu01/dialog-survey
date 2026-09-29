import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma-client.js';

export interface PrismaFactoryOptions {
  connectionString?: string;
}

/**
 * Sole production construction point for PrismaClient (design DD-003/DD-010).
 *
 * Throws when no connection string is available (DATABASE_URL missing) —
 * fails loudly, never returns a half-configured client.
 *
 * Pool/timeouts mirror the v6 (Rust engine) baseline: the pg driver has no
 * connect timeout by default, v6 used 5s. SSL is declared via the connection
 * string, not invented here.
 */
export function createPrismaClient(options: PrismaFactoryOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to create a PrismaClient');
  }
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter });
}
