import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import { WebSocket } from "ws";

interface StreamConnection {
  socket: WebSocket;
  userId: string;
  conversationId: string;
  connectedAt: Date;
  lastActivityAt: Date;
}

interface StreamMessage {
  type: "connect" | "message" | "disconnect";
  userId?: string;
  conversationId?: string;
  payload?: unknown;
}

const streamRoutes: FastifyPluginCallback = (fastify) => {
  const connections = new Map<string, StreamConnection>();

  fastify.get(
    "/stream",
    { websocket: true },
    (socket: WebSocket, req: FastifyRequest) => {
      const clientId =
        (req.headers["x-client-id"] as string) ||
        Math.random().toString(36).substring(2, 10);

      fastify.log.info("Stream connection established: %s", clientId);

      const streamConnection: StreamConnection = {
        socket,
        userId: "",
        conversationId: "",
        connectedAt: new Date(),
        lastActivityAt: new Date(),
      };

      connections.set(clientId, streamConnection);

      socket.on("message", (data: Buffer): void => {
        try {
          const message: StreamMessage = JSON.parse(
            data.toString(),
          ) as StreamMessage;
          streamConnection.lastActivityAt = new Date();

          fastify.log.debug(
            "Received stream message from %s: %j",
            clientId,
            message,
          );

          switch (message.type) {
            case "connect":
              streamConnection.userId = message.userId || "";
              streamConnection.conversationId = message.conversationId || "";
              fastify.log.info(
                "Stream connection authenticated: %s, user=%s",
                clientId,
                streamConnection.userId,
              );
              socket.send(
                JSON.stringify({
                  type: "connected",
                  timestamp: new Date().toISOString(),
                  message: "Connection established",
                }),
              );
              break;

            case "message":
              handleStreamMessage(streamConnection, message.payload);
              break;

            case "disconnect":
              fastify.log.info("Stream connection disconnected: %s", clientId);
              socket.close();
              break;

            default:
              fastify.log.warn("Unknown stream message type: %s", message.type);
              socket.send(
                JSON.stringify({
                  type: "error",
                  timestamp: new Date().toISOString(),
                  error: "Unknown message type",
                }),
              );
          }
        } catch (error) {
          fastify.log.error(
            "Error processing stream message from %s: %s",
            clientId,
            error,
          );
          socket.send(
            JSON.stringify({
              type: "error",
              timestamp: new Date().toISOString(),
              error: "Invalid message format",
            }),
          );
        }
      });

      socket.on("close", (code: number, reason: Buffer) => {
        fastify.log.info(
          "Stream connection closed: %s, code=%s, reason=%s",
          clientId,
          code,
          reason.toString(),
        );
        connections.delete(clientId);
      });

      socket.on("error", (error: Error) => {
        fastify.log.error("Stream connection error: %s, %s", clientId, error);
      });

      const heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "heartbeat",
              timestamp: new Date().toISOString(),
            }),
          );
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
    },
  );

  function handleStreamMessage(
    connection: StreamConnection,
    payload: unknown,
  ): void {
    try {
      const response = processStreamMessage(connection, payload);

      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(
          JSON.stringify({
            type: "response",
            timestamp: new Date().toISOString(),
            data: response,
          }),
        );
      }
    } catch (error) {
      fastify.log.error("Error processing stream message: %s", error);
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(
          JSON.stringify({
            type: "error",
            timestamp: new Date().toISOString(),
            error: "Error processing message",
          }),
        );
      }
    }
  }

  function processStreamMessage(
    _connection: StreamConnection,
    payload: unknown,
  ): { message: string; payload: unknown } {
    return {
      message: "Message received",
      payload,
    };
  }

  fastify.get("/stream/health", () => {
    return {
      code: 0,
      msg: "success",
      data: {
        connections: connections.size,
      },
    };
  });
};

export default streamRoutes;
