import type { FastifyPluginAsync } from 'fastify';

const streamRoutes: FastifyPluginAsync = async (fastify) => {
  const connections = new Map<string, any>();

  fastify.get('/stream', { websocket: true }, (connection, req) => {
    const clientId = (req.headers['x-client-id'] as string) || Math.random().toString(36).substring(2, 10);

    fastify.log.info('Stream connection established: %s', clientId);

    connections.set(clientId, connection);

    // Handle incoming messages
    (connection as any).on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        fastify.log.debug('Received stream message from %s: %j', clientId, message);

        // Echo back the message
        (connection as any).send(JSON.stringify({
          type: 'response',
          timestamp: new Date().toISOString(),
          data: message,
        }));
      } catch (error) {
        fastify.log.error('Error processing stream message from %s: %s', clientId, error as string);
        (connection as any).send(JSON.stringify({
          type: 'error',
          timestamp: new Date().toISOString(),
          error: 'Invalid message format',
        }));
      }
    });

    // Handle connection close
    (connection as any).on('close', (code: number, reason: string) => {
      fastify.log.info('Stream connection closed: %s, code=%s, reason=%s', clientId, code, reason);
      connections.delete(clientId);
    });

    // Handle errors
    (connection as any).on('error', (error: Error) => {
      fastify.log.error('Stream connection error: %s, %s', clientId, error);
    });

    // Send heartbeat
    const heartbeatInterval = setInterval(() => {
      if ((connection as any).readyState === 1) {
        (connection as any).send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        }));
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);
  });

  // Health check for stream endpoint
  fastify.get('/stream/health', async () => {
    return {
      code: 0,
      msg: 'success',
      data: {
        connections: connections.size,
      },
    };
  });
};

export default streamRoutes;
