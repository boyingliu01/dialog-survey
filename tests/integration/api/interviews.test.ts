import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/server.js';

describe('Interviews API', () => {
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

  describe('GET /api/interviews', () => {
    it('should return list of interviews', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.msg).toBe('success');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should accept status filter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews?status=IN_PROGRESS',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
    });

    it('should accept pagination parameters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews?limit=10&offset=0',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
    });
  });

  describe('GET /api/interviews/:sessionId', () => {
    it('should return 404 for non-existent interview', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews/non-existent-id',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe(404);
      expect(body.msg).toBe('Interview not found');
    });
  });

  describe('POST /api/interviews/:sessionId/end', () => {
    it('should return 404 for non-existent interview', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/interviews/non-existent-id/end',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe(404);
      expect(body.msg).toBe('Interview not found');
    });
  });

  describe('GET /api/interviews/:sessionId/report', () => {
    it('should return 404 for non-existent interview', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews/non-existent-id/report',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe(404);
      expect(body.msg).toBe('Interview not found');
    });
  });

  describe('GET /api/interviews/:sessionId/messages', () => {
    it('should return 404 for non-existent interview', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/interviews/non-existent-id/messages',
        headers: {
          'x-api-key': 'test-api-key',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe(404);
      expect(body.msg).toBe('Interview not found');
    });
  });
});
