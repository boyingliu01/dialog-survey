import type { FastifyPluginAsync } from 'fastify';

interface Interview {
  id: string;
  sessionId: string;
  userId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

const interviews: Interview[] = [];

const interviewsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all interviews with filtering and pagination
  fastify.get('/interviews', async (request) => {
    const { status, limit, offset } = request.query as any;

    let filteredInterviews = interviews;
    if (status) {
      filteredInterviews = interviews.filter((i) => i.status === status);
    }

    const paginated = filteredInterviews.slice(offset || 0, (offset || 0) + (limit || 20));

    return {
      code: 0,
      msg: 'success',
      data: paginated,
    };
  });

  // Get single interview
  fastify.get('/interviews/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as any;
    const interview = interviews.find((i) => i.sessionId === sessionId);

    if (!interview) {
      return reply.status(404).send({
        code: 404,
        msg: 'Interview not found',
      });
    }

    return {
      code: 0,
      msg: 'success',
      data: interview,
    };
  });

  // End interview
  fastify.post('/interviews/:sessionId/end', async (request, reply) => {
    const { sessionId } = request.params as any;
    const interview = interviews.find((i) => i.sessionId === sessionId);

    if (!interview) {
      return reply.status(404).send({
        code: 404,
        msg: 'Interview not found',
      });
    }

    interview.status = 'COMPLETED';
    interview.updatedAt = new Date().toISOString();

    return {
      code: 0,
      msg: 'success',
      data: interview,
    };
  });

  // Get interview report
  fastify.get('/interviews/:sessionId/report', async (request, reply) => {
    const { sessionId } = request.params as any;
    const interview = interviews.find((i) => i.sessionId === sessionId);

    if (!interview) {
      return reply.status(404).send({
        code: 404,
        msg: 'Interview not found',
      });
    }

    return reply.status(404).send({
      code: 404,
      msg: 'Report not available',
    });
  });

  // Get interview messages
  fastify.get('/interviews/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as any;
    const interview = interviews.find((i) => i.sessionId === sessionId);

    if (!interview) {
      return reply.status(404).send({
        code: 404,
        msg: 'Interview not found',
      });
    }

    return {
      code: 0,
      msg: 'success',
      data: [],
    };
  });
};

export default interviewsRoutes;
