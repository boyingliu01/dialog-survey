import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src-clean/server.js';

describe('Templates API', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
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
