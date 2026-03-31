import type { FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';

interface StreamConnection {
  socket: WebSocket;
  userId: string;
  conversationId: string;
  connectedAt: Date;
  lastActivityAt: Date;
}

const streamRoutes: FastifyPluginAsync = async (fastify) => {
  const connections = new Map<string, StreamConnection>();

  fastify.get('/stream', { /* websocket: true */ }, (_connection, _req) => {
    const clientId = (_req as any).headers['x-client-id'] as string || Math.random().toString(36).substring(2, 10);

    fastify.log.info('Stream connection established: %s', clientId);

    const streamConnection: StreamConnection = {
      socket: _connection as any,
      userId: '',
      conversationId: '',
      connectedAt: new Date(),
      lastActivityAt: new Date(),
    };

    connections.set(clientId, streamConnection);

    // Handle incoming messages
    (_connection as any).on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        streamConnection.lastActivityAt = new Date();

        fastify.log.debug('Received stream message from %s: %j', clientId, message);

        // Process different message types
        switch (message.type) {
          case 'connect':
            streamConnection.userId = message.userId || '';
            streamConnection.conversationId = message.conversationId || '';
            fastify.log.info('Stream connection authenticated: %s, user=%s', clientId, streamConnection.userId);
            (_connection as any).send(JSON.stringify({
              type: 'connected',
              timestamp: new Date().toISOString(),
              message: 'Connection established',
            }));
            break;

          case 'message':
            await handleStreamMessage(streamConnection, message.payload);
            break;

          case 'disconnect':
            fastify.log.info('Stream connection disconnected: %s', clientId);
            (_connection as any).close();
            break;

          default:
            fastify.log.warn('Unknown stream message type: %s', message.type);
            (_connection as any).send(JSON.stringify({
              type: 'error',
              timestamp: new Date().toISOString(),
              error: 'Unknown message type',
            }));
        }
      } catch (error) {
        fastify.log.error('Error processing stream message from %s: %s', clientId, error);
        (_connection as any).send(JSON.stringify({
          type: 'error',
          timestamp: new Date().toISOString(),
          error: 'Invalid message format',
        }));
      }
    });

    // Handle connection close
    (_connection as any).on('close', (code: number, reason: string) => {
      fastify.log.info('Stream connection closed: %s, code=%s, reason=%s', clientId, code, reason);
      connections.delete(clientId);
    });

    // Handle errors
    (_connection as any).on('error', (error: Error) => {
      fastify.log.error('Stream connection error: %s, %s', clientId, error);
    });

    // Send heartbeat
    const heartbeatInterval = setInterval(() => {
      if ((_connection as any).readyState === WebSocket.OPEN) {
        (_connection as any).send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        }));
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);
  });

  async function handleStreamMessage(connection: StreamConnection, payload: any): Promise<void> {
    try {
      const response = await processStreamMessage(connection, payload);

      if ((connection.socket as any).readyState === WebSocket.OPEN) {
        (connection.socket as any).send(JSON.stringify({
          type: 'response',
          timestamp: new Date().toISOString(),
          data: response,
        }));
      }
    } catch (error) {
      fastify.log.error('Error processing stream message: %s', error);
      if ((connection.socket as any).readyState === WebSocket.OPEN) {
        (connection.socket as any).send(JSON.stringify({
          type: 'error',
          timestamp: new Date().toISOString(),
          error: 'Error processing message',
        }));
      }
    }
  }

  async function processStreamMessage(_connection: StreamConnection, payload: any) {
    // TODO: Implement actual stream message processing
    // This should integrate with the interview engine
    return {
      message: 'Message received',
      payload,
    };
  }

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
