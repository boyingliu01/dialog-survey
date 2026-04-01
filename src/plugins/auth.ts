import { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Verify API key from X-API-Key header
  const verifyApiKey = async (request: any, reply: any) => {
    const apiKey = request.headers["x-api-key"];

    if (!apiKey) {
      reply.status(401).send({
        code: 401,
        msg: "Missing API key",
      });
      return;
    }

    if (apiKey !== config.INTERNAL_API_KEY) {
      fastify.log.warn("Invalid API key attempt");
      reply.status(403).send({
        code: 403,
        msg: "Invalid API key",
      });
      return;
    }

    fastify.log.debug("API key verified");
  };

  // Decorate fastify with auth methods
  fastify.decorate("auth", {
    verifyApiKey,
  });

  // Add validation schema for API key header
  fastify.addHook("preHandler", async (request, reply) => {
    // Skip API key verification for public endpoints
    const publicPaths = ["/webhook", "/stream", "/templates"];
    const isPublic = publicPaths.some((path) => request.url.startsWith(path));

    if (!isPublic) {
      await verifyApiKey(request, reply);
    }
  });
};

export default authPlugin;
