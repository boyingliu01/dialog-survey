import type { PrismaClient } from '@prisma/client';
import { TemplateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TemplateRepository } from '../repositories/template.repository.js';
import { updateTemplateDimensions } from '../services/template-dimension.service.js';

export interface TemplateRoutesOptions {
  templateRepo: TemplateRepository;
  prisma: PrismaClient;
}

/** Helper to format template response object (avoids duplication) */
function formatTemplateResponse(template: {
  id: string;
  name: string;
  description: string | null;
  content: string;
  version: number;
  status: TemplateStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    content: JSON.parse(template.content),
    version: template.version,
    status: template.status,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.object({}).passthrough(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  content: z.object({}).passthrough().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export async function templateRoutes(fastify: FastifyInstance, opts: TemplateRoutesOptions) {
  const { templateRepo, prisma } = opts;

  fastify.post('/api/templates', async (request, _reply) => {
    const input = createTemplateSchema.parse(request.body);
    const template = await templateRepo.create({
      name: input.name,
      ...(input.description != null ? { description: input.description } : {}),
      content: input.content as Record<string, unknown>,
    });
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      content: JSON.parse(template.content),
      version: template.version,
      status: template.status,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  });

  fastify.get('/api/templates', async (_request, _reply) => {
    const templates = await templateRepo.findAll();
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      content: JSON.parse(t.content),
      version: t.version,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  });

  fastify.get('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await templateRepo.findById(id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return reply.send(formatTemplateResponse(template));
  });

  fastify.put('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateTemplateSchema.parse(request.body);

    const existing = await templateRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const template = await templateRepo.update(id, {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.description != null ? { description: input.description } : {}),
      ...(input.content != null ? { content: input.content as Record<string, unknown> } : {}),
      ...(input.status != null ? { status: input.status as TemplateStatus } : {}),
    });

    return reply.send(formatTemplateResponse(template));
  });

  fastify.put('/api/templates/:id/dimensions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      dimensions?: Array<{ id: string; label: string; keywords?: string[] }>;
    };

    if (!body.dimensions) {
      return reply.status(400).send({ error: 'dimensions field is required' });
    }

    try {
      const template = await updateTemplateDimensions(prisma, id, body.dimensions);
      return {
        id: template.id,
        name: template.name,
        dimensions: template.dimensions,
        updatedAt: template.updatedAt,
      };
    } catch (e) {
      if (e instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid dimensions', message: e.message });
      }
      throw e;
    }
  });

  fastify.delete('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await templateRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    await templateRepo.delete(id);
    return { success: true };
  });

  fastify.post('/api/templates/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await templateRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const template = await templateRepo.update(id, {
      status: TemplateStatus.PUBLISHED,
    });
    return {
      id: template.id,
      name: template.name,
      status: template.status,
    };
  });

  fastify.post('/api/templates/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await templateRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const template = await templateRepo.update(id, {
      status: TemplateStatus.ARCHIVED,
    });
    return {
      id: template.id,
      name: template.name,
      status: template.status,
    };
  });

  fastify.get('/api/templates/:id/version', async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await templateRepo.findById(id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return {
      id: template.id,
      version: template.version,
    };
  });

  fastify.post('/api/templates/:id/version', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await templateRepo.findById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    const template = await templateRepo.incrementVersion(id);
    return {
      id: template.id,
      version: template.version,
    };
  });

  fastify.get('/api/templates/export', async (_request, _reply) => {
    const templates = await templateRepo.findAll();
    return templates.map((t) => ({
      name: t.name,
      description: t.description,
      content: JSON.parse(t.content),
      version: t.version,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  });

  fastify.get('/api/templates/export/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await templateRepo.findById(id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    return {
      name: template.name,
      description: template.description,
      content: JSON.parse(template.content),
      version: template.version,
      status: template.status,
    };
  });

  fastify.post('/api/templates/import', async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      content: Record<string, unknown>;
    };

    if (!body.name || !body.content) {
      return reply.status(400).send({ error: 'name and content are required' });
    }

    const template = await templateRepo.create({
      name: body.name,
      ...(body.description != null ? { description: body.description } : {}),
      content: body.content,
    });

    return {
      id: template.id,
      name: template.name,
      status: template.status,
    };
  });
}
