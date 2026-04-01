import { FastifyPluginCallback, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";

const authPlugin: FastifyPluginCallback = (fastify) => {
  const verifyApiKey = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): boolean => {
    const apiKey = request.headers["x-api-key"];

    if (!apiKey) {
      void reply.status(401).send({
        code: 401,
        msg: "Missing API key",
      });
      return false;
    }

    if (apiKey !== config.INTERNAL_API_KEY) {
      fastify.log.warn("Invalid API key attempt");
      void reply.status(403).send({
        code: 403,
        msg: "Invalid API key",
      });
      return false;
    }

    fastify.log.debug("API key verified");
    return true;
  };

  fastify.decorate("auth", {
    verifyApiKey,
  });

  fastify.addHook("preHandler", (request, reply) => {
    const publicPaths = ["/webhook", "/stream", "/templates"];
    const isPublic = publicPaths.some((path) => request.url.startsWith(path));

    if (!isPublic) {
      verifyApiKey(request, reply);
    }
  });
};

export default authPlugin;
