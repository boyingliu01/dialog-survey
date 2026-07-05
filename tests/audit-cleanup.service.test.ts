import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditCleanupService } from '../src/services/audit-cleanup.service.js';

const prisma = new PrismaClient();
const service = new AuditCleanupService(prisma);

describe('AuditCleanupService', () => {
  beforeAll(async () => {
    // Clean any leftover test data
    await prisma.auditLog.deleteMany({
      where: {
        entityType: 'test-cleanup',
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: 'test-cleanup',
      },
    });
    await prisma.$disconnect();
  });

  describe('cleanupOldLogs', () => {
    it('should delete audit logs with expiresAt in the past', async () => {
      const past = new Date(Date.now() - 10_000);
      await prisma.auditLog.create({
        data: {
          action: 'TEST_READ',
          entityType: 'test-cleanup',
          entityId: 'expired-1',
          details: 'old log with expiresAt',
          ipAddress: '127.0.0.1',
          expiresAt: past,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'TEST_READ',
          entityType: 'test-cleanup',
          entityId: 'expired-2',
          details: 'another old log',
          ipAddress: '127.0.0.1',
          expiresAt: past,
        },
      });

      // Create a log that should NOT be deleted (expiresAt in future)
      const future = new Date(Date.now() + 86_400_000);
      await prisma.auditLog.create({
        data: {
          action: 'TEST_READ',
          entityType: 'test-cleanup',
          entityId: 'future-1',
          details: 'future log — should survive',
          ipAddress: '127.0.0.1',
          expiresAt: future,
        },
      });

      const result = await service.cleanupOldLogs(365);

      expect(result.deleted).toBeGreaterThanOrEqual(2);

      // Verify future log still exists
      const remaining = await prisma.auditLog.findMany({
        where: { entityId: 'future-1' },
      });
      expect(remaining).toHaveLength(1);
    });

    it('should delete logs without expiresAt that are older than retention days', async () => {
      // Create a log with createdAt older than 365 days but no expiresAt
      const oldDate = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
      await prisma.auditLog.create({
        data: {
          action: 'TEST_READ',
          entityType: 'test-cleanup',
          entityId: 'no-expiry-old',
          details: 'old log without expiresAt fallback',
          ipAddress: '127.0.0.1',
          createdAt: oldDate,
        },
      });

      const result = await service.cleanupOldLogs(365);

      expect(result.deleted).toBeGreaterThanOrEqual(1);

      const remaining = await prisma.auditLog.findMany({
        where: { entityId: 'no-expiry-old' },
      });
      expect(remaining).toHaveLength(0);
    });

    it('should keep logs with expiresAt in the future', async () => {
      const future = new Date(Date.now() + 86_400_000);
      await prisma.auditLog.create({
        data: {
          action: 'TEST_READ',
          entityType: 'test-cleanup',
          entityId: 'keep-future',
          details: 'should not be deleted',
          ipAddress: '127.0.0.1',
          expiresAt: future,
        },
      });

      await service.cleanupOldLogs(365);

      // The future log should NOT be counted in deleted
      const remaining = await prisma.auditLog.findMany({
        where: { entityId: 'keep-future' },
      });
      expect(remaining).toHaveLength(1);
    });

    it('should return { deleted: 0 } when no old logs exist', async () => {
      const result = await service.cleanupOldLogs(0);

      expect(result).toHaveProperty('deleted');
      expect(typeof result.deleted).toBe('number');
    });
  });
});
