// @ts-nocheck
function stryNS_9fa48() {
  var g =
    (typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis) ||
    new Function('return this')();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (
    ns.activeMutant === undefined &&
    g.process &&
    g.process.env &&
    g.process.env.__STRYKER_ACTIVE_MUTANT__
  ) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov =
    ns.mutantCoverage ||
    (ns.mutantCoverage = {
      static: {},
      perTest: {},
    });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { PrismaClient, TemplateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TemplateRepository } from '../repositories/template.repository.js';
import { updateTemplateDimensions } from '../services/template-dimension.service.js';
const createTemplateSchema = z.object(
  stryMutAct_9fa48('895')
    ? {}
    : (stryCov_9fa48('895'),
      {
        name: stryMutAct_9fa48('896')
          ? z.string().max(1)
          : (stryCov_9fa48('896'), z.string().min(1)),
        description: z.string().optional(),
        content: z.object({}).passthrough(),
      })
);
const updateTemplateSchema = z.object(
  stryMutAct_9fa48('897')
    ? {}
    : (stryCov_9fa48('897'),
      {
        name: stryMutAct_9fa48('898')
          ? z.string().max(1).optional()
          : (stryCov_9fa48('898'), z.string().min(1).optional()),
        description: z.string().optional(),
        content: z.object({}).passthrough().optional(),
        status: z
          .enum(
            stryMutAct_9fa48('899')
              ? []
              : (stryCov_9fa48('899'),
                [
                  stryMutAct_9fa48('900') ? '' : (stryCov_9fa48('900'), 'DRAFT'),
                  stryMutAct_9fa48('901') ? '' : (stryCov_9fa48('901'), 'PUBLISHED'),
                  stryMutAct_9fa48('902') ? '' : (stryCov_9fa48('902'), 'ARCHIVED'),
                ])
          )
          .optional(),
      })
);
export async function templateRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('903')) {
    {
    }
  } else {
    stryCov_9fa48('903');
    const templateRepo = new TemplateRepository();
    const prisma = new PrismaClient();
    fastify.post(
      stryMutAct_9fa48('904') ? '' : (stryCov_9fa48('904'), '/api/templates'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('905')) {
          {
          }
        } else {
          stryCov_9fa48('905');
          const input = createTemplateSchema.parse(request.body);
          const template = await templateRepo.create(
            stryMutAct_9fa48('906')
              ? {}
              : (stryCov_9fa48('906'),
                {
                  name: input.name,
                  description: input.description,
                  content: input.content as Record<string, unknown>,
                })
          );
          return stryMutAct_9fa48('907')
            ? {}
            : (stryCov_9fa48('907'),
              {
                id: template.id,
                name: template.name,
                description: template.description,
                content: JSON.parse(template.content),
                version: template.version,
                status: template.status,
                createdAt: template.createdAt,
                updatedAt: template.updatedAt,
              });
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('908') ? '' : (stryCov_9fa48('908'), '/api/templates'),
      async (_request, _reply) => {
        if (stryMutAct_9fa48('909')) {
          {
          }
        } else {
          stryCov_9fa48('909');
          const templates = await templateRepo.findAll();
          return templates.map(
            stryMutAct_9fa48('910')
              ? () => undefined
              : (stryCov_9fa48('910'),
                (t) =>
                  stryMutAct_9fa48('911')
                    ? {}
                    : (stryCov_9fa48('911'),
                      {
                        id: t.id,
                        name: t.name,
                        description: t.description,
                        content: JSON.parse(t.content),
                        version: t.version,
                        status: t.status,
                        createdAt: t.createdAt,
                        updatedAt: t.updatedAt,
                      }))
          );
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('912') ? '' : (stryCov_9fa48('912'), '/api/templates/:id'),
      async (request, reply) => {
        if (stryMutAct_9fa48('913')) {
          {
          }
        } else {
          stryCov_9fa48('913');
          const { id } = request.params as {
            id: string;
          };
          const template = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('916')
              ? false
              : stryMutAct_9fa48('915')
                ? true
                : stryMutAct_9fa48('914')
                  ? template
                  : (stryCov_9fa48('914', '915', '916'), !template)
          ) {
            if (stryMutAct_9fa48('917')) {
              {
              }
            } else {
              stryCov_9fa48('917');
              return reply.status(404).send(
                stryMutAct_9fa48('918')
                  ? {}
                  : (stryCov_9fa48('918'),
                    {
                      error: stryMutAct_9fa48('919')
                        ? ''
                        : (stryCov_9fa48('919'), 'Template not found'),
                    })
              );
            }
          }
          return stryMutAct_9fa48('920')
            ? {}
            : (stryCov_9fa48('920'),
              {
                id: template.id,
                name: template.name,
                description: template.description,
                content: JSON.parse(template.content),
                version: template.version,
                status: template.status,
                createdAt: template.createdAt,
                updatedAt: template.updatedAt,
              });
        }
      }
    );
    fastify.put(
      stryMutAct_9fa48('921') ? '' : (stryCov_9fa48('921'), '/api/templates/:id'),
      async (request, reply) => {
        if (stryMutAct_9fa48('922')) {
          {
          }
        } else {
          stryCov_9fa48('922');
          const { id } = request.params as {
            id: string;
          };
          const input = updateTemplateSchema.parse(request.body);
          const existing = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('925')
              ? false
              : stryMutAct_9fa48('924')
                ? true
                : stryMutAct_9fa48('923')
                  ? existing
                  : (stryCov_9fa48('923', '924', '925'), !existing)
          ) {
            if (stryMutAct_9fa48('926')) {
              {
              }
            } else {
              stryCov_9fa48('926');
              return reply.status(404).send(
                stryMutAct_9fa48('927')
                  ? {}
                  : (stryCov_9fa48('927'),
                    {
                      error: stryMutAct_9fa48('928')
                        ? ''
                        : (stryCov_9fa48('928'), 'Template not found'),
                    })
              );
            }
          }
          const template = await templateRepo.update(
            id,
            stryMutAct_9fa48('929')
              ? {}
              : (stryCov_9fa48('929'),
                {
                  name: input.name,
                  description: input.description,
                  content: input.content as Record<string, unknown> | undefined,
                  status: input.status as TemplateStatus | undefined,
                })
          );
          return stryMutAct_9fa48('930')
            ? {}
            : (stryCov_9fa48('930'),
              {
                id: template.id,
                name: template.name,
                description: template.description,
                content: JSON.parse(template.content),
                version: template.version,
                status: template.status,
                createdAt: template.createdAt,
                updatedAt: template.updatedAt,
              });
        }
      }
    );
    fastify.put(
      stryMutAct_9fa48('931') ? '' : (stryCov_9fa48('931'), '/api/templates/:id/dimensions'),
      async (request, reply) => {
        if (stryMutAct_9fa48('932')) {
          {
          }
        } else {
          stryCov_9fa48('932');
          const { id } = request.params as {
            id: string;
          };
          const body = request.body as {
            dimensions?: Array<{
              id: string;
              label: string;
              keywords?: string[];
            }>;
          };
          if (
            stryMutAct_9fa48('935')
              ? false
              : stryMutAct_9fa48('934')
                ? true
                : stryMutAct_9fa48('933')
                  ? body.dimensions
                  : (stryCov_9fa48('933', '934', '935'), !body.dimensions)
          ) {
            if (stryMutAct_9fa48('936')) {
              {
              }
            } else {
              stryCov_9fa48('936');
              return reply.status(400).send(
                stryMutAct_9fa48('937')
                  ? {}
                  : (stryCov_9fa48('937'),
                    {
                      error: stryMutAct_9fa48('938')
                        ? ''
                        : (stryCov_9fa48('938'), 'dimensions field is required'),
                    })
              );
            }
          }
          try {
            if (stryMutAct_9fa48('939')) {
              {
              }
            } else {
              stryCov_9fa48('939');
              const template = await updateTemplateDimensions(prisma, id, body.dimensions);
              return stryMutAct_9fa48('940')
                ? {}
                : (stryCov_9fa48('940'),
                  {
                    id: template.id,
                    name: template.name,
                    dimensions: template.dimensions,
                    updatedAt: template.updatedAt,
                  });
            }
          } catch (e) {
            if (stryMutAct_9fa48('941')) {
              {
              }
            } else {
              stryCov_9fa48('941');
              if (
                stryMutAct_9fa48('943')
                  ? false
                  : stryMutAct_9fa48('942')
                    ? true
                    : (stryCov_9fa48('942', '943'), e instanceof z.ZodError)
              ) {
                if (stryMutAct_9fa48('944')) {
                  {
                  }
                } else {
                  stryCov_9fa48('944');
                  return reply.status(400).send(
                    stryMutAct_9fa48('945')
                      ? {}
                      : (stryCov_9fa48('945'),
                        {
                          error: stryMutAct_9fa48('946')
                            ? ''
                            : (stryCov_9fa48('946'), 'Invalid dimensions'),
                          message: e.message,
                        })
                  );
                }
              }
              throw e;
            }
          }
        }
      }
    );
    fastify.delete(
      stryMutAct_9fa48('947') ? '' : (stryCov_9fa48('947'), '/api/templates/:id'),
      async (request, reply) => {
        if (stryMutAct_9fa48('948')) {
          {
          }
        } else {
          stryCov_9fa48('948');
          const { id } = request.params as {
            id: string;
          };
          const existing = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('951')
              ? false
              : stryMutAct_9fa48('950')
                ? true
                : stryMutAct_9fa48('949')
                  ? existing
                  : (stryCov_9fa48('949', '950', '951'), !existing)
          ) {
            if (stryMutAct_9fa48('952')) {
              {
              }
            } else {
              stryCov_9fa48('952');
              return reply.status(404).send(
                stryMutAct_9fa48('953')
                  ? {}
                  : (stryCov_9fa48('953'),
                    {
                      error: stryMutAct_9fa48('954')
                        ? ''
                        : (stryCov_9fa48('954'), 'Template not found'),
                    })
              );
            }
          }
          await templateRepo.delete(id);
          return stryMutAct_9fa48('955')
            ? {}
            : (stryCov_9fa48('955'),
              {
                success: stryMutAct_9fa48('956') ? false : (stryCov_9fa48('956'), true),
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('957') ? '' : (stryCov_9fa48('957'), '/api/templates/:id/publish'),
      async (request, reply) => {
        if (stryMutAct_9fa48('958')) {
          {
          }
        } else {
          stryCov_9fa48('958');
          const { id } = request.params as {
            id: string;
          };
          const existing = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('961')
              ? false
              : stryMutAct_9fa48('960')
                ? true
                : stryMutAct_9fa48('959')
                  ? existing
                  : (stryCov_9fa48('959', '960', '961'), !existing)
          ) {
            if (stryMutAct_9fa48('962')) {
              {
              }
            } else {
              stryCov_9fa48('962');
              return reply.status(404).send(
                stryMutAct_9fa48('963')
                  ? {}
                  : (stryCov_9fa48('963'),
                    {
                      error: stryMutAct_9fa48('964')
                        ? ''
                        : (stryCov_9fa48('964'), 'Template not found'),
                    })
              );
            }
          }
          const template = await templateRepo.update(
            id,
            stryMutAct_9fa48('965')
              ? {}
              : (stryCov_9fa48('965'),
                {
                  status: TemplateStatus.PUBLISHED,
                })
          );
          return stryMutAct_9fa48('966')
            ? {}
            : (stryCov_9fa48('966'),
              {
                id: template.id,
                name: template.name,
                status: template.status,
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('967') ? '' : (stryCov_9fa48('967'), '/api/templates/:id/archive'),
      async (request, reply) => {
        if (stryMutAct_9fa48('968')) {
          {
          }
        } else {
          stryCov_9fa48('968');
          const { id } = request.params as {
            id: string;
          };
          const existing = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('971')
              ? false
              : stryMutAct_9fa48('970')
                ? true
                : stryMutAct_9fa48('969')
                  ? existing
                  : (stryCov_9fa48('969', '970', '971'), !existing)
          ) {
            if (stryMutAct_9fa48('972')) {
              {
              }
            } else {
              stryCov_9fa48('972');
              return reply.status(404).send(
                stryMutAct_9fa48('973')
                  ? {}
                  : (stryCov_9fa48('973'),
                    {
                      error: stryMutAct_9fa48('974')
                        ? ''
                        : (stryCov_9fa48('974'), 'Template not found'),
                    })
              );
            }
          }
          const template = await templateRepo.update(
            id,
            stryMutAct_9fa48('975')
              ? {}
              : (stryCov_9fa48('975'),
                {
                  status: TemplateStatus.ARCHIVED,
                })
          );
          return stryMutAct_9fa48('976')
            ? {}
            : (stryCov_9fa48('976'),
              {
                id: template.id,
                name: template.name,
                status: template.status,
              });
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('977') ? '' : (stryCov_9fa48('977'), '/api/templates/:id/version'),
      async (request, reply) => {
        if (stryMutAct_9fa48('978')) {
          {
          }
        } else {
          stryCov_9fa48('978');
          const { id } = request.params as {
            id: string;
          };
          const template = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('981')
              ? false
              : stryMutAct_9fa48('980')
                ? true
                : stryMutAct_9fa48('979')
                  ? template
                  : (stryCov_9fa48('979', '980', '981'), !template)
          ) {
            if (stryMutAct_9fa48('982')) {
              {
              }
            } else {
              stryCov_9fa48('982');
              return reply.status(404).send(
                stryMutAct_9fa48('983')
                  ? {}
                  : (stryCov_9fa48('983'),
                    {
                      error: stryMutAct_9fa48('984')
                        ? ''
                        : (stryCov_9fa48('984'), 'Template not found'),
                    })
              );
            }
          }
          return stryMutAct_9fa48('985')
            ? {}
            : (stryCov_9fa48('985'),
              {
                id: template.id,
                version: template.version,
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('986') ? '' : (stryCov_9fa48('986'), '/api/templates/:id/version'),
      async (request, reply) => {
        if (stryMutAct_9fa48('987')) {
          {
          }
        } else {
          stryCov_9fa48('987');
          const { id } = request.params as {
            id: string;
          };
          const existing = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('990')
              ? false
              : stryMutAct_9fa48('989')
                ? true
                : stryMutAct_9fa48('988')
                  ? existing
                  : (stryCov_9fa48('988', '989', '990'), !existing)
          ) {
            if (stryMutAct_9fa48('991')) {
              {
              }
            } else {
              stryCov_9fa48('991');
              return reply.status(404).send(
                stryMutAct_9fa48('992')
                  ? {}
                  : (stryCov_9fa48('992'),
                    {
                      error: stryMutAct_9fa48('993')
                        ? ''
                        : (stryCov_9fa48('993'), 'Template not found'),
                    })
              );
            }
          }
          const template = await templateRepo.incrementVersion(id);
          return stryMutAct_9fa48('994')
            ? {}
            : (stryCov_9fa48('994'),
              {
                id: template.id,
                version: template.version,
              });
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('995') ? '' : (stryCov_9fa48('995'), '/api/templates/export'),
      async (_request, _reply) => {
        if (stryMutAct_9fa48('996')) {
          {
          }
        } else {
          stryCov_9fa48('996');
          const templates = await templateRepo.findAll();
          return templates.map(
            stryMutAct_9fa48('997')
              ? () => undefined
              : (stryCov_9fa48('997'),
                (t) =>
                  stryMutAct_9fa48('998')
                    ? {}
                    : (stryCov_9fa48('998'),
                      {
                        name: t.name,
                        description: t.description,
                        content: JSON.parse(t.content),
                        version: t.version,
                        status: t.status,
                        createdAt: t.createdAt,
                        updatedAt: t.updatedAt,
                      }))
          );
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('999') ? '' : (stryCov_9fa48('999'), '/api/templates/export/:id'),
      async (request, reply) => {
        if (stryMutAct_9fa48('1000')) {
          {
          }
        } else {
          stryCov_9fa48('1000');
          const { id } = request.params as {
            id: string;
          };
          const template = await templateRepo.findById(id);
          if (
            stryMutAct_9fa48('1003')
              ? false
              : stryMutAct_9fa48('1002')
                ? true
                : stryMutAct_9fa48('1001')
                  ? template
                  : (stryCov_9fa48('1001', '1002', '1003'), !template)
          ) {
            if (stryMutAct_9fa48('1004')) {
              {
              }
            } else {
              stryCov_9fa48('1004');
              return reply.status(404).send(
                stryMutAct_9fa48('1005')
                  ? {}
                  : (stryCov_9fa48('1005'),
                    {
                      error: stryMutAct_9fa48('1006')
                        ? ''
                        : (stryCov_9fa48('1006'), 'Template not found'),
                    })
              );
            }
          }
          return stryMutAct_9fa48('1007')
            ? {}
            : (stryCov_9fa48('1007'),
              {
                name: template.name,
                description: template.description,
                content: JSON.parse(template.content),
                version: template.version,
                status: template.status,
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('1008') ? '' : (stryCov_9fa48('1008'), '/api/templates/import'),
      async (request, reply) => {
        if (stryMutAct_9fa48('1009')) {
          {
          }
        } else {
          stryCov_9fa48('1009');
          const body = request.body as {
            name: string;
            description?: string;
            content: Record<string, unknown>;
          };
          if (
            stryMutAct_9fa48('1012')
              ? !body.name && !body.content
              : stryMutAct_9fa48('1011')
                ? false
                : stryMutAct_9fa48('1010')
                  ? true
                  : (stryCov_9fa48('1010', '1011', '1012'),
                    (stryMutAct_9fa48('1013') ? body.name : (stryCov_9fa48('1013'), !body.name)) ||
                      (stryMutAct_9fa48('1014')
                        ? body.content
                        : (stryCov_9fa48('1014'), !body.content)))
          ) {
            if (stryMutAct_9fa48('1015')) {
              {
              }
            } else {
              stryCov_9fa48('1015');
              return reply.status(400).send(
                stryMutAct_9fa48('1016')
                  ? {}
                  : (stryCov_9fa48('1016'),
                    {
                      error: stryMutAct_9fa48('1017')
                        ? ''
                        : (stryCov_9fa48('1017'), 'name and content are required'),
                    })
              );
            }
          }
          const template = await templateRepo.create(
            stryMutAct_9fa48('1018')
              ? {}
              : (stryCov_9fa48('1018'),
                {
                  name: body.name,
                  description: body.description,
                  content: body.content,
                })
          );
          return stryMutAct_9fa48('1019')
            ? {}
            : (stryCov_9fa48('1019'),
              {
                id: template.id,
                name: template.name,
                status: template.status,
              });
        }
      }
    );
  }
}
