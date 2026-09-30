import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyTestSchema, createTestPglite, getTestSchemaDdl } from './helpers/pglite-template.js';

/**
 * @test REQ-PRISMA7-002
 * @intent DDL 回放契约（冷启动回退路径）：DDL 生成结果跨调用记忆化；新鲜 PGlite 回放后
 *         schema 可查询；模板快路径与 DDL 回放路径落出同一 public 表集合（AC-PRISMA7-002-01
 *         「PGlite 内存库回放 DDL 成功」的直接证据）
 * @covers AC-PRISMA7-002-01
 */
describe('pglite-template contract', () => {
  it('memoizes the generated DDL across calls', async () => {
    const first = await getTestSchemaDdl();
    const second = await getTestSchemaDdl();

    expect(first).toBe(second);
    expect(first).toContain('CREATE TABLE');
  });

  it('replays the DDL onto a fresh in-memory PGlite (fallback path)', async () => {
    const replay = new PGlite();
    await replay.waitReady;
    try {
      await applyTestSchema(replay);

      expect(await publicTables(replay)).toContain('Interview');
    } finally {
      await replay.close();
    }
  });

  it('fast path (loadDataDir) and fallback (DDL replay) agree on the public table set', async () => {
    const fastPath = await createTestPglite();
    const replay = new PGlite();
    await replay.waitReady;
    try {
      await applyTestSchema(replay);

      expect(await publicTables(fastPath)).toEqual(await publicTables(replay));
    } finally {
      await fastPath.close();
      await replay.close();
    }
  });
});

async function publicTables(pglite: PGlite): Promise<string[]> {
  const result = await pglite.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  return result.rows.map((row) => row.table_name);
}
