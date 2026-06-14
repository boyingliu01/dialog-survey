import { PrismaClient } from '@prisma/client';
import { info } from '../utils/logger.js';

export class AuditCleanupService {
  constructor(private prisma: PrismaClient) {}

  async cleanupOldLogs(daysToRetain: number = 90): Promise<{ deleted: number }> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - daysToRetain * 24 * 60 * 60 * 1000);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        OR: [
          // rows with expiresAt in the past
          { expiresAt: { lt: now } },
          // backwards compat: rows without expiresAt fall back to createdAt + daysToRetain
          { expiresAt: null, createdAt: { lt: cutoff } },
        ],
      },
    });

    info('AuditLog cleanup completed', {
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    });

    return { deleted: result.count };
  }
}
