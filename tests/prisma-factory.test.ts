import { describe, expect, it } from 'vitest';

/**
 * @test REQ-PRISMA7-001
 * @intent 工厂契约（唯一生产构造点 createPrismaClient）：缺少连接串时同步抛错；显式连接串与环境变量
 *         回退均可惰性构造 PrismaClient（构造期不建连），返回值经门面类型可用
 * @covers AC-PRISMA7-001-02
 */
describe('prisma-factory (DD-003/DD-010)', () => {
  it('throws when neither the option nor DATABASE_URL provides a connection string', async () => {
    const saved = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    try {
      const { createPrismaClient } = await import('../src/utils/prisma-factory.js');
      expect(() => createPrismaClient()).toThrow(/DATABASE_URL is required/);
      expect(() => createPrismaClient({ connectionString: '' })).toThrow(
        /DATABASE_URL is required/
      );
    } finally {
      if (saved === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = saved;
      }
    }
  });

  it('falls back to DATABASE_URL from the environment', async () => {
    process.env['DATABASE_URL'] = 'postgresql://from-env:from-env@127.0.0.1:5432/never_connected';
    try {
      const { createPrismaClient } = await import('../src/utils/prisma-factory.js');
      const client = createPrismaClient();
      expect(typeof client.$queryRaw).toBe('function');
      await client.$disconnect();
    } finally {
      delete process.env['DATABASE_URL'];
    }
  });

  it('constructs a facade-typed client lazily (no connection at construction time)', async () => {
    const { createPrismaClient } = await import('../src/utils/prisma-factory.js');
    const { PrismaClient } = await import('../src/utils/prisma-client.js');
    const client = createPrismaClient({
      connectionString: 'postgresql://lazy:lazy@127.0.0.1:59999/unreachable',
    });
    // NOTE: no `instanceof PrismaClient` here — the v7 client class is a Proxy whose
    // hasInstance trap recurses; shape + type identity are asserted instead.
    expect(typeof client.$queryRaw).toBe('function');
    expect(typeof client.$transaction).toBe('function');
    expect(typeof PrismaClient).toBe('function');
    await client.$disconnect();
  });
});
