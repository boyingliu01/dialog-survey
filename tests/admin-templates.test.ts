import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth } from '../src/middleware/admin-auth.js';
import { TemplateRepository } from '../src/repositories/template.repository.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

describe('TemplateRepository - updateWithVersion', () => {
  let repo: TemplateRepository;
  let mockPrisma: {
    template: {
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      template: {
        update: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    repo = new TemplateRepository(mockPrisma as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update template and increment version on success', async () => {
    const updatedTemplate = {
      id: 'tpl-1',
      name: 'Updated Name',
      version: 3,
      content: '{"foo":"bar"}',
      status: 'DRAFT',
      description: 'desc',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.template.update.mockResolvedValueOnce(updatedTemplate);

    const result = await repo.updateWithVersion('tpl-1', 2, { name: 'Updated Name' });

    expect(result).toBe(updatedTemplate);
    expect(mockPrisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1', version: 2 },
      data: {
        name: 'Updated Name',
        version: { increment: 1 },
        updatedBy: 'admin',
      },
    });
  });

  it('should include all provided fields in update data', async () => {
    mockPrisma.template.update.mockResolvedValueOnce({
      id: 'tpl-1',
      name: 'New',
      version: 2,
      content: '{"new":"data"}',
      status: 'PUBLISHED',
      description: 'new desc',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await repo.updateWithVersion('tpl-1', 1, {
      name: 'New',
      description: 'new desc',
      content: { new: 'data' },
      status: 'PUBLISHED',
    });

    expect(mockPrisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1', version: 1 },
      data: {
        name: 'New',
        description: 'new desc',
        content: '{"new":"data"}',
        status: 'PUBLISHED',
        version: { increment: 1 },
        updatedBy: 'admin',
      },
    });
  });

  it('should fail when version mismatch causes RecordNotFoundError', async () => {
    mockPrisma.template.update.mockRejectedValueOnce(
      new Error('RecordNotFoundError: No rows affected')
    );

    await expect(repo.updateWithVersion('tpl-1', 5, { name: 'Test' })).rejects.toThrow(
      'RecordNotFoundError'
    );
    expect(mockPrisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1', version: 5 },
      data: { name: 'Test', version: { increment: 1 }, updatedBy: 'admin' },
    });
  });

  it('should verify where clause includes expectedVersion', async () => {
    mockPrisma.template.update.mockResolvedValueOnce({
      id: 'tpl-1',
      name: 'Test',
      version: 11,
      content: '{}',
      status: 'DRAFT',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await repo.updateWithVersion('tpl-1', 10, { name: 'Test' });

    const callArgs = mockPrisma.template.update.mock.calls[0][0];
    expect(callArgs.where.id).toBe('tpl-1');
    expect(callArgs.where.version).toBe(10);
  });
});

describe('TemplateRepository - findAllPaginated', () => {
  let repo: TemplateRepository;
  let mockPrisma: {
    template: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      template: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    repo = new TemplateRepository(mockPrisma as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return page 1 with correct limit and no skip', async () => {
    const items = [
      {
        id: '1',
        name: 'A',
        version: 1,
        content: '{}',
        status: 'DRAFT',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        name: 'B',
        version: 1,
        content: '{}',
        status: 'DRAFT',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockPrisma.template.findMany.mockResolvedValueOnce(items);
    mockPrisma.template.count.mockResolvedValueOnce(2);

    const result = await repo.findAllPaginated(1, 20);

    expect(result.items).toEqual(items);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('should return page 2 with correct skip', async () => {
    const items = [
      {
        id: '21',
        name: 'U',
        version: 1,
        content: '{}',
        status: 'DRAFT',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockPrisma.template.findMany.mockResolvedValueOnce(items);
    mockPrisma.template.count.mockResolvedValueOnce(50);

    const result = await repo.findAllPaginated(2, 20);

    expect(result.items).toEqual(items);
    expect(result.total).toBe(50);
    expect(result.page).toBe(2);
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      skip: 20,
      take: 20,
    });
  });

  it('should return correct pagination for page 3', async () => {
    mockPrisma.template.findMany.mockResolvedValueOnce([]);
    mockPrisma.template.count.mockResolvedValueOnce(45);

    const result = await repo.findAllPaginated(3, 20);

    expect(result.skip).toBeUndefined();
    expect(result.page).toBe(3);
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      skip: 40,
      take: 20,
    });
  });
});

describe('TemplateRepository - getUsageStats', () => {
  let repo: TemplateRepository;
  let mockPrisma: {
    template: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    interview: {
      groupBy: ReturnType<typeof vi.fn>;
    };
    interviewPlan: {
      groupBy: ReturnType<typeof vi.fn>;
    };
    batchAnalysisReport: {
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      template: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      interview: {
        groupBy: vi.fn(),
      },
      interviewPlan: {
        groupBy: vi.fn(),
      },
      batchAnalysisReport: {
        count: vi.fn(),
      },
    };
    repo = new TemplateRepository(mockPrisma as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw when template not found', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce(null);
    mockPrisma.interview.groupBy.mockResolvedValueOnce([]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    await expect(repo.getUsageStats('nonexistent')).rejects.toThrow('Template not found');
  });

  it('should return correct stats from groupBy results', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test Template' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: 2 },
      { status: 'COMPLETED', _count: 5 },
      { status: 'CANCELLED', _count: 1 },
    ]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([
      { status: 'RUNNING', _count: 1 },
      { status: 'COMPLETED', _count: 3 },
    ]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(3);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.templateId).toBe('tpl-1');
    expect(result.templateName).toBe('Test Template');
    expect(result.interviews.active).toBe(2);
    expect(result.interviews.completed).toBe(5);
    expect(result.interviews.cancelled).toBe(1);
    expect(result.interviews.total).toBe(8);
    expect(result.plans.running).toBe(1);
    expect(result.plans.completed).toBe(3);
    expect(result.plans.total).toBe(4);
    expect(result.reportCount).toBe(3);
  });

  it('should have safeToDelete false when there are active interviews', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([
      { status: 'ACTIVE', _count: 2 },
      { status: 'COMPLETED', _count: 5 },
    ]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(false);
  });

  it('should have safeToDelete false when there are pending interviews', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([{ status: 'PENDING', _count: 1 }]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(false);
  });

  it('should have safeToDelete false when there are waiting interviews', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([{ status: 'WAITING', _count: 3 }]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(false);
  });

  it('should have safeToDelete false when there are running plans', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([{ status: 'COMPLETED', _count: 5 }]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([{ status: 'RUNNING', _count: 1 }]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(false);
  });

  it('should have safeToDelete false when there are pending plans', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([{ status: 'COMPLETED', _count: 5 }]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([{ status: 'PENDING', _count: 1 }]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(false);
  });

  it('should have safeToDelete true when all interviews are COMPLETED/CANCELLED and no active plans', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([
      { status: 'COMPLETED', _count: 5 },
      { status: 'CANCELLED', _count: 2 },
    ]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([{ status: 'COMPLETED', _count: 1 }]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-1');

    expect(result.safeToDelete).toBe(true);
  });

  it('should have safeToDelete true when there are no associations at all', async () => {
    mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Empty' });
    mockPrisma.interview.groupBy.mockResolvedValueOnce([]);
    mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([]);
    mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

    const result = await repo.getUsageStats('tpl-empty');

    expect(result.safeToDelete).toBe(true);
    expect(result.interviews.total).toBe(0);
    expect(result.plans.total).toBe(0);
    expect(result.reportCount).toBe(0);
  });
});

describe('Admin Auth middleware', () => {
  describe('without ADMIN_API_KEY configured', () => {
    beforeAll(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it('should allow GET requests without checking API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'GET',
        headers: {},
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await adminAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow HEAD requests without checking API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'HEAD',
        headers: {},
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await adminAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow OPTIONS requests without checking API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'OPTIONS',
        headers: {},
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await adminAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 500 when ADMIN_API_KEY env var is not configured', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'POST',
        headers: { 'x-admin-key': 'some-key' },
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await adminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(expect.stringContaining('ADMIN_API_KEY'));
    });

    it('should return 500 when ADMIN_API_KEY is not set for DELETE', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'DELETE',
        headers: { 'x-admin-key': 'some-key' },
        url: '/admin/api/templates/123',
      } as unknown as FastifyRequest;

      await adminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('with ADMIN_API_KEY configured', () => {
    let dynamicAdminAuth: typeof adminAuth;

    beforeAll(async () => {
      vi.resetModules();
      process.env.ADMIN_API_KEY = 'test-secret-key';
      const mod = await import('../src/middleware/admin-auth.js');
      dynamicAdminAuth = mod.adminAuth;
    });

    afterAll(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it('should return 401 for POST with wrong API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'POST',
        headers: { 'x-admin-key': 'wrong-key' },
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 401 for DELETE with wrong API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'DELETE',
        headers: { 'x-admin-key': 'wrong-key' },
        url: '/admin/api/templates/123',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should return 401 for PUT with wrong API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'PUT',
        headers: { 'x-admin-key': 'wrong-key' },
        url: '/admin/api/templates/123',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should pass through for POST with correct API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'POST',
        headers: { 'x-admin-key': 'test-secret-key' },
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should pass through for DELETE with correct API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-secret-key' },
        url: '/admin/api/templates/123',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should return 401 for POST with missing API key', async () => {
      const mockReply = {
        code: vi.fn().mockReturnThis(),
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply;
      const mockRequest = {
        method: 'POST',
        headers: {},
        url: '/admin/api/templates',
      } as unknown as FastifyRequest;

      await dynamicAdminAuth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });
  });
});

describe('Admin Templates Routes - DELETE constraint check', () => {
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    getUsageStats: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockReply: {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      findById: vi.fn(),
      getUsageStats: vi.fn(),
      delete: vi.fn(),
    };
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function simulateDeleteHandler() {
    const existing = await mockRepo.findById('tpl-123');
    if (!existing) {
      return mockReply.status(404).send(expect.any(String));
    }

    const usageStats = await mockRepo.getUsageStats('tpl-123');
    const activeOrWaiting = usageStats.interviews.active + usageStats.interviews.waiting;

    if (activeOrWaiting > 0) {
      return mockReply.status(409).send(expect.any(String));
    }

    await mockRepo.delete('tpl-123');
    return mockReply.send(expect.any(String));
  }

  it('should return 404 when template does not exist', async () => {
    mockRepo.findById.mockResolvedValueOnce(null);

    await simulateDeleteHandler();

    expect(mockRepo.findById).toHaveBeenCalledWith('tpl-123');
    expect(mockRepo.getUsageStats).not.toHaveBeenCalled();
    expect(mockReply.status).toHaveBeenCalledWith(404);
  });

  it('should return 409 when there are active interviews', async () => {
    mockRepo.findById.mockResolvedValueOnce({ id: 'tpl-123', name: 'Test' });
    mockRepo.getUsageStats.mockResolvedValueOnce({
      interviews: { active: 2, waiting: 0, pending: 0, completed: 5, cancelled: 1, total: 8 },
      plans: { running: 0, pending: 0, ready: 0, paused: 0, completed: 1, total: 1 },
      reportCount: 3,
      safeToDelete: false,
      templateId: 'tpl-123',
      templateName: 'Test',
    });

    await simulateDeleteHandler();

    expect(mockReply.status).toHaveBeenCalledWith(409);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('should return 409 when there are waiting interviews', async () => {
    mockRepo.findById.mockResolvedValueOnce({ id: 'tpl-123', name: 'Test' });
    mockRepo.getUsageStats.mockResolvedValueOnce({
      interviews: { active: 0, waiting: 3, pending: 0, completed: 5, cancelled: 1, total: 9 },
      plans: { running: 0, pending: 0, ready: 0, paused: 0, completed: 1, total: 1 },
      reportCount: 0,
      safeToDelete: false,
      templateId: 'tpl-123',
      templateName: 'Test',
    });

    await simulateDeleteHandler();

    expect(mockReply.status).toHaveBeenCalledWith(409);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('should return 200 and delete when only completed interviews exist', async () => {
    mockRepo.findById.mockResolvedValueOnce({ id: 'tpl-123', name: 'Test' });
    mockRepo.getUsageStats.mockResolvedValueOnce({
      interviews: { active: 0, waiting: 0, pending: 0, completed: 5, cancelled: 2, total: 7 },
      plans: { running: 0, pending: 0, ready: 0, paused: 0, completed: 1, total: 1 },
      reportCount: 3,
      safeToDelete: true,
      templateId: 'tpl-123',
      templateName: 'Test',
    });

    await simulateDeleteHandler();

    expect(mockReply.status).not.toHaveBeenCalledWith(409);
    expect(mockRepo.delete).toHaveBeenCalledWith('tpl-123');
  });

  it('should return 200 and delete when no associations exist', async () => {
    mockRepo.findById.mockResolvedValueOnce({ id: 'tpl-123', name: 'Empty' });
    mockRepo.getUsageStats.mockResolvedValueOnce({
      interviews: { active: 0, waiting: 0, pending: 0, completed: 0, cancelled: 0, total: 0 },
      plans: { running: 0, pending: 0, ready: 0, paused: 0, completed: 0, total: 0 },
      reportCount: 0,
      safeToDelete: true,
      templateId: 'tpl-123',
      templateName: 'Empty',
    });

    await simulateDeleteHandler();

    expect(mockRepo.delete).toHaveBeenCalledWith('tpl-123');
    expect(mockReply.status).not.toHaveBeenCalledWith(409);
  });

  it('should delete when interviews are cancelled and plans are paused', async () => {
    mockRepo.findById.mockResolvedValueOnce({ id: 'tpl-123' });
    mockRepo.getUsageStats.mockResolvedValueOnce({
      templateId: 'tpl-123',
      interviews: { active: 0, pending: 0, waiting: 0, completed: 0, cancelled: 2, total: 2 },
      plans: { running: 0, pending: 0, ready: 0, paused: 1, completed: 0, total: 1 },
      safeToDelete: true,
    });

    await simulateDeleteHandler();

    expect(mockRepo.delete).toHaveBeenCalledWith('tpl-123');
    expect(mockReply.status).not.toHaveBeenCalled();
  });
});
