import type { FastifyPluginCallback } from "fastify";
import { getTemplateService } from "../services/template.js";
import { z } from "zod";

const templatesRoutes: FastifyPluginCallback = (fastify) => {
  const templateService = getTemplateService();

  // Get all templates
  fastify.get("/templates", () => {
    const templates = templateService.listTemplates();
    return {
      code: 0,
      msg: "success",
      data: templates,
    };
  });

  // Get single template
  const getTemplateParamsSchema = z.object({
    id: z.string().min(1, "Template ID is required"),
  });

  fastify.get<{ Params: { id: string } }>(
    "/templates/:id",
    {
      schema: {
        params: getTemplateParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const template = templateService.getTemplate(id);

      if (!template) {
        return reply.status(404).send({
          code: 404,
          msg: "Template not found",
        });
      }

      return {
        code: 0,
        msg: "success",
        data: template,
      };
    },
  );
};

export default templatesRoutes;
