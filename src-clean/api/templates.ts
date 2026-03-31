import type { FastifyPluginAsync } from 'fastify';

interface Template {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

const templates: Template[] = [
  {
    id: 'template-1',
    name: 'Basic Template',
    description: 'A basic interview template for general use',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template-2',
    name: 'Technical Interview',
    description: 'Template for technical interviews',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const templatesRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all templates
  fastify.get('/templates', async () => {
    return {
      code: 0,
      msg: 'success',
      data: templates,
    };
  });

  // Get single template
  fastify.get('/templates/:id', async (request, reply) => {
    const { id } = request.params as any;
    const template = templates.find((t) => t.id === id);

    if (!template) {
      return reply.status(404).send({
        code: 404,
        msg: 'Template not found',
      });
    }

    return {
      code: 0,
      msg: 'success',
      data: template,
    };
  });
};

export default templatesRoutes;
