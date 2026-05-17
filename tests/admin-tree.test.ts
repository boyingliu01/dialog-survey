import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';

const prisma = new PrismaClient();

describe('Admin Tree Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    process.env.ADMIN_API_KEY = undefined;
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /admin', () => {
    it('should return 200 with tree structure containing tree-node class', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Tree Test Template',
          content: '[]',
          status: 'DRAFT',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('tree-node');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 200 with admin interface in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('访谈管理后台');
    });
  });

  describe('GET /admin/content/templates/:id', () => {
    it('should return 404 for non-existent template ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/content/templates/non-existent-template-id',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('模板不存在');
    });
  });

  describe('GET /admin/content/plans/:id', () => {
    it('should return 404 for non-existent plan ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/content/plans/non-existent-plan-id',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('计划不存在');
    });
  });

  describe('GET /admin/content/reports/:interviewId', () => {
    it('should return 404 for non-existent interview ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/content/reports/non-existent-interview-id',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('访谈不存在');
    });
  });

  describe('GET /admin/content/plans/:id/all-interviews', () => {
    it('should return 404 for non-existent plan ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/content/plans/non-existent-plan-id-2/all-interviews',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('计划不存在');
    });
  });
});
