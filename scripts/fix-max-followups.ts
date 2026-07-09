#!/usr/bin/env tsx
// @no-test-required: One-time database migration script, not application logic
/**
 * 修复脚本：将已存在的 interview 记录的 maxFollowups 从 2 更新为 5
 *
 * 背景：
 * v1.8.0 将 maxFollowups 默认值从 2 改为 5，但 prisma db push 不会更新已存在的记录。
 * 这个脚本会一次性更新所有旧记录。
 *
 * 使用方法：
 * npx tsx scripts/fix-max-followups.ts
 */

import { PrismaClient } from '@prisma/client';
import { error, info } from '../src/utils/logger.js';

const prisma = new PrismaClient();

async function fixMaxFollowups() {
  info('Starting maxFollowups fix...');

  try {
    // 查询有多少旧记录需要更新
    const oldRecords = await prisma.interview.count({
      where: { maxFollowups: 2 },
    });

    if (oldRecords === 0) {
      info('No old records found. All interviews already have maxFollowups = 5.');
      return;
    }

    info(`Found ${oldRecords} interview(s) with maxFollowups = 2`);

    // 执行更新
    const result = await prisma.interview.updateMany({
      where: { maxFollowups: 2 },
      data: { maxFollowups: 5 },
    });

    info(`Successfully updated ${result.count} interview(s) to maxFollowups = 5`);
  } catch (err) {
    error('Failed to fix maxFollowups', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

fixMaxFollowups()
  .then(() => {
    info('Fix completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    error('Fix failed', { error: err.message });
    process.exit(1);
  });
