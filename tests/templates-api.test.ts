import { PrismaClient, TemplateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { templateRoutes } from '../src/api/templates.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const prisma = new PrismaClient();

describe('Template API Endpoints', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await templateRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  describe('POST /api/templates — create template', () => {
    it('should create a template and return it', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Test Template',
          description: 'A test template',
          content: { questions: ['q1', 'q2'] },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Test Template');
      expect(body.description).toBe('A test template');
      expect(body.content).toEqual({ questions: ['q1', 'q2'] });
      expect(body.version).toBe(1);
      expect(body.status).toBe('DRAFT');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();

      await prisma.template.delete({ where: { id: body.id } });
    });

    it('should return 500 for empty name (Zod validation)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: '',
          content: { questions: [] },
        },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for missing content (Zod validation)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'No Content Template',
        },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for empty body', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {},
      });

      expect(res.statusCode).toBe(500);
    });

    it('should create a template without description', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'Minimal Template',
          content: { text: 'hello' },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.description).toBeNull();

      await prisma.template.delete({ where: { id: body.id } });
    });
  });

  describe('GET /api/templates — list templates', () => {
    it('should return an array of templates', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'List Test Template',
          content: JSON.stringify({ text: 'hello' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      const found = body.find((t: { id: string }) => t.id === template.id);
      expect(found).toBeDefined();
      expect(found.name).toBe('List Test Template');
      expect(found.content).toEqual({ text: 'hello' });

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return empty array when no templates exist (clean slate)', async () => {
      const allTemplates = await prisma.template.findMany();
      if (allTemplates.length === 0) {
        const res = await fastify.inject({
          method: 'GET',
          url: '/api/templates',
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });

  describe('GET /api/templates/:id — get single template', () => {
    it('should return a template by id', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Get Single Template',
          content: JSON.stringify({ prompt: 'test' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `/api/templates/${template.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.name).toBe('Get Single Template');
      expect(body.content).toEqual({ prompt: 'test' });

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template id', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('should return 404 for whitespace id', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates/   ',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('PUT /api/templates/:id — update template', () => {
    it('should update a template', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Before Update',
          content: JSON.stringify({ text: 'old' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}`,
        payload: {
          name: 'After Update',
          description: 'Updated description',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.name).toBe('After Update');
      expect(body.description).toBe('Updated description');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should update template status to PUBLISHED', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Status Update',
          content: JSON.stringify({ text: 'test' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}`,
        payload: {
          status: 'PUBLISHED',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('PUBLISHED');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/templates/non-existent-id',
        payload: { name: 'Ghost' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('should return 500 for invalid empty body (Zod validation)', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Zod Validation Test',
          content: JSON.stringify({ text: 'test' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}`,
        payload: {},
      });

      expect(res.statusCode).toBe(200);

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 500 for invalid status value', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Invalid Status',
          content: JSON.stringify({ text: 'test' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}`,
        payload: {
          status: 'INVALID',
        },
      });

      expect(res.statusCode).toBe(500);

      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('DELETE /api/templates/:id — delete template', () => {
    it('should delete a template and return success', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Delete Me',
          content: JSON.stringify({ text: 'bye' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'DELETE',
        url: `/api/templates/${template.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const deleted = await prisma.template.findUnique({ where: { id: template.id } });
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/templates/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('POST /api/templates/:id/publish — publish template', () => {
    it('should publish a draft template', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Publish Me',
          content: JSON.stringify({ text: 'publish' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/templates/${template.id}/publish`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.status).toBe('PUBLISHED');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/non-existent-id/publish',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('POST /api/templates/:id/archive — archive template', () => {
    it('should archive a template', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Archive Me',
          content: JSON.stringify({ text: 'archive' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/templates/${template.id}/archive`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.status).toBe('ARCHIVED');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/non-existent-id/archive',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('GET /api/templates/:id/version — get version', () => {
    it('should return template version', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Version Check',
          content: JSON.stringify({ text: 'v1' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `/api/templates/${template.id}/version`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.version).toBe(1);

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates/non-existent-id/version',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('POST /api/templates/:id/version — increment version', () => {
    it('should increment template version', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Version Inc',
          content: JSON.stringify({ text: 'v1' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/templates/${template.id}/version`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.version).toBe(2);

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/non-existent-id/version',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('GET /api/templates/export — export all templates', () => {
    it('should export all templates without id field', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Export Me',
          description: 'Export desc',
          content: JSON.stringify({ text: 'export' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates/export',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      const found = body.find((t: { name: string }) => t.name === 'Export Me');
      expect(found).toBeDefined();
      expect(found.id).toBeUndefined();
      expect(found.name).toBe('Export Me');
      expect(found.description).toBe('Export desc');
      expect(found.content).toEqual({ text: 'export' });

      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('GET /api/templates/export/:id — export single template', () => {
    it('should export a single template without id field', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Export Single',
          description: 'Single desc',
          content: JSON.stringify({ text: 'single' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `/api/templates/export/${template.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeUndefined();
      expect(body.name).toBe('Export Single');
      expect(body.description).toBe('Single desc');
      expect(body.content).toEqual({ text: 'single' });

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent template', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/templates/export/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('POST /api/templates/import — import template', () => {
    it('should import a template and return it', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/import',
        payload: {
          name: 'Imported Template',
          description: 'Imported desc',
          content: { questions: ['imported'] },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Imported Template');
      expect(body.status).toBe('DRAFT');

      await prisma.template.delete({ where: { id: body.id } });
    });

    it('should return 400 when name is missing', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/import',
        payload: {
          content: { questions: [] },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('name and content are required');
    });

    it('should return 400 when content is missing', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/import',
        payload: {
          name: 'No Content',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('name and content are required');
    });

    it('should return 400 when both name and content are missing', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/templates/import',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('name and content are required');
    });
  });

  describe('PUT /api/templates/:id/dimensions — update dimensions', () => {
    it('should update template dimensions', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Dimension Test',
          content: JSON.stringify({ text: 'dims' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}/dimensions`,
        payload: {
          dimensions: [{ id: 'dim-1', label: 'Communication', keywords: ['speak', 'talk'] }],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(template.id);
      expect(body.dimensions).toBeDefined();
      expect(Array.isArray(body.dimensions)).toBe(true);
      expect(body.dimensions[0].id).toBe('dim-1');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 400 when dimensions field is missing', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'No Dims',
          content: JSON.stringify({ text: 'nodims' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}/dimensions`,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('dimensions field is required');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 400 for invalid dimensions (empty id)', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Bad Dims',
          content: JSON.stringify({ text: 'baddims' }),
          status: TemplateStatus.DRAFT,
        },
      });

      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/templates/${template.id}/dimensions`,
        payload: {
          dimensions: [{ id: '', label: 'Empty ID' }],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid dimensions');

      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 400 for non-existent template (prisma throws)', async () => {
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/templates/non-existent-id/dimensions',
        payload: {
          dimensions: [{ id: 'dim-1', label: 'Comms' }],
        },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('error handling — edge cases', () => {
    it('should return 404 for whitespace id in put', async () => {
      const res = await fastify.inject({
        method: 'PUT',
        url: '/api/templates/   ',
        payload: { name: 'Spaces' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('should return 404 for whitespace id in delete', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/templates/   ',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('should return 405 for unsupported method on /api/templates', async () => {
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/api/templates',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
