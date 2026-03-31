import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/server.js';
import { getTemplateService } from '../../../src/services/template.js';

// Mock template service
vi.mock('../../../src/services/template.js');

describe('Templates API', () => {
  let server: FastifyInstance;
  const mockTemplateService = {
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
  };

  beforeAll(async () => {
    (getTemplateService as vi.Mock).mockReturnValue(mockTemplateService);
    server = buildServer({
      skipPlugins: ['auth'],
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/templates', () => {
    it('should return list of templates', async () => {
      mockTemplateService.listTemplates.mockReturnValue([]);
      
      const response = await server.inject({
        method: 'GET',
        url: '/api/templates',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe('success');
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/templates/:id', () => {
    it('should return 404 for non-existent template', async () => {
      mockTemplateService.getTemplate.mockReturnValue(null);
      
      const response = await server.inject({
        method: 'GET',
        url: '/api/templates/non-existent-id',
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe(404);
      expect(body.msg).toBe('Template not found');
    });
  });
});