import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

let mockPrismaInstance: {
  $queryRaw: ReturnType<typeof vi.fn>;
  $disconnect: ReturnType<typeof vi.fn>;
  auditLog: { create: ReturnType<typeof vi.fn> };
  apiKey: { findFirst: ReturnType<typeof vi.fn> };
  interviewPlan: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  template: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

mockPrismaInstance = {
  $queryRaw: vi.fn(),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  auditLog: { create: vi.fn().mockResolvedValue({}) },
  apiKey: { findFirst: vi.fn().mockResolvedValue({ userId: 'test', id: 'test-key', role: 'admin' }) },
  interviewPlan: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  template: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function FakePrismaClient() {
    return mockPrismaInstance;
  },
}));

// checkDatabaseConnection tests use a custom mock


describe('buildApp', () => {
  let fastify: Awaited<ReturnType<typeof import('../src/server.js').then>>;

  beforeAll(async () => {
    const { buildApp } = await import('../src/server.js');
    const result = await buildApp();
    fastify = result.fastify;
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should create a Fastify app instance', () => {
    expect(fastify).toBeDefined();
    expect(typeof fastify).toBe('object');
    expect(typeof fastify.inject).toBe('function');
    expect(typeof fastify.listen).toBe('function');
    expect(typeof fastify.close).toBe('function');
  });

  it('should have health route registered', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('db');
    expect(body.checks).toHaveProperty('llm');
    expect(body.checks).toHaveProperty('dingtalk');
  });

  it('should have webhook route registered', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/webhook',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(response.statusCode).not.toBe(404);
  });

  it('should have interview plan routes registered', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/plans',
    });
    expect(response.statusCode).not.toBe(404);
  });

  it('should have template routes registered', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/templates',
    });
    expect(response.statusCode).not.toBe(404);
  });

  it('should have analysis routes registered', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/analysis/single',
      headers: { 'content-type': 'application/json' },
      payload: { interviewId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(response.statusCode).not.toBe(404);
  });

  it('should have admin template routes registered', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/admin/api/templates',
    });
    expect(response.statusCode).not.toBe(404);
  });

  it('should return 404 for unknown routes', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/nonexistent-route-xyz',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('checkDatabaseConnection', () => {
  beforeEach(() => {
    mockPrismaInstance = {
      $queryRaw: vi.fn(),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      apiKey: { findFirst: vi.fn().mockResolvedValue({ userId: 'test', id: 'test-key', role: 'admin' }) },
      interviewPlan: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      template: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  });

  it('should return true when database connection succeeds', async () => {
    mockPrismaInstance.$queryRaw.mockResolvedValue([{ '1': 1 }]);

    const { checkDatabaseConnection } = await import('../src/server.js');
    const result = await checkDatabaseConnection();

    expect(result).toBe(true);
    expect(mockPrismaInstance.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrismaInstance.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('should return false when database connection times out', async () => {
    mockPrismaInstance.$queryRaw = vi.fn().mockImplementation(
      () =>
        new Promise<never>(() => {
          // intentionally never resolves
        })
    );

    const { checkDatabaseConnection } = await import('../src/server.js');
    const result = await checkDatabaseConnection();

    expect(result).toBe(false);
  }, 10000);

  it('should return false when database connection rejects', async () => {
    mockPrismaInstance.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    const { checkDatabaseConnection } = await import('../src/server.js');
    const result = await checkDatabaseConnection();

    expect(result).toBe(false);
    expect(mockPrismaInstance.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrismaInstance.$disconnect).toHaveBeenCalledTimes(1);
  });
});
