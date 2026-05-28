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
import { PlanStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InterviewPlanService, type InviteeData } from '../services/interview-plan.service.js';
const createPlanSchema = z.object(
  stryMutAct_9fa48('859')
    ? {}
    : (stryCov_9fa48('859'),
      {
        name: stryMutAct_9fa48('860')
          ? z.string().max(1)
          : (stryCov_9fa48('860'), z.string().min(1)),
        description: z.string().optional(),
        templateId: z.string().uuid(),
        targetDate: z.string().datetime().optional(),
        schedule: z.string().optional(),
      })
);
const importInviteesSchema = z.object(
  stryMutAct_9fa48('861')
    ? {}
    : (stryCov_9fa48('861'),
      {
        invitees: z.array(
          z.object(
            stryMutAct_9fa48('862')
              ? {}
              : (stryCov_9fa48('862'),
                {
                  userId: z.string(),
                  name: z.string(),
                  email: z.string().optional(),
                  phone: z.string().optional(),
                  customFields: z.record(z.string(), z.unknown()).optional(),
                })
          )
        ),
      })
);
export async function interviewPlanRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('863')) {
    {
    }
  } else {
    stryCov_9fa48('863');
    const planService = new InterviewPlanService();
    fastify.post(
      stryMutAct_9fa48('864') ? '' : (stryCov_9fa48('864'), '/api/plans'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('865')) {
          {
          }
        } else {
          stryCov_9fa48('865');
          const input = createPlanSchema.parse(request.body);
          const planId = await planService.createPlan(
            stryMutAct_9fa48('866')
              ? {}
              : (stryCov_9fa48('866'),
                {
                  ...input,
                  targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
                })
          );
          return stryMutAct_9fa48('867')
            ? {}
            : (stryCov_9fa48('867'),
              {
                id: planId,
              });
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('868') ? '' : (stryCov_9fa48('868'), '/api/plans'),
      async (request) => {
        if (stryMutAct_9fa48('869')) {
          {
          }
        } else {
          stryCov_9fa48('869');
          const { status, limit, offset } = request.query as {
            status?: PlanStatus;
            limit?: number;
            offset?: number;
          };
          return planService.listPlans(
            stryMutAct_9fa48('870')
              ? {}
              : (stryCov_9fa48('870'),
                {
                  status,
                  limit,
                  offset,
                })
          );
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('871') ? '' : (stryCov_9fa48('871'), '/api/plans/:id'),
      async (request, reply) => {
        if (stryMutAct_9fa48('872')) {
          {
          }
        } else {
          stryCov_9fa48('872');
          const { id } = request.params as {
            id: string;
          };
          const plan = await planService.getPlan(id);
          if (
            stryMutAct_9fa48('875')
              ? false
              : stryMutAct_9fa48('874')
                ? true
                : stryMutAct_9fa48('873')
                  ? plan
                  : (stryCov_9fa48('873', '874', '875'), !plan)
          ) {
            if (stryMutAct_9fa48('876')) {
              {
              }
            } else {
              stryCov_9fa48('876');
              return reply.status(404).send(
                stryMutAct_9fa48('877')
                  ? {}
                  : (stryCov_9fa48('877'),
                    {
                      error: stryMutAct_9fa48('878')
                        ? ''
                        : (stryCov_9fa48('878'), 'Plan not found'),
                    })
              );
            }
          }
          return plan;
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('879') ? '' : (stryCov_9fa48('879'), '/api/plans/:id/invitees'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('880')) {
          {
          }
        } else {
          stryCov_9fa48('880');
          const { id } = request.params as {
            id: string;
          };
          const { invitees } = importInviteesSchema.parse(request.body);
          const result = await planService.importInvitees(id, invitees as InviteeData[]);
          return result;
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('881') ? '' : (stryCov_9fa48('881'), '/api/plans/:id/send'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('882')) {
          {
          }
        } else {
          stryCov_9fa48('882');
          const { id } = request.params as {
            id: string;
          };
          const result = await planService.sendInvitations(id);
          return result;
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('883') ? '' : (stryCov_9fa48('883'), '/api/plans/:id/pause'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('884')) {
          {
          }
        } else {
          stryCov_9fa48('884');
          const { id } = request.params as {
            id: string;
          };
          await planService.pausePlan(id);
          return stryMutAct_9fa48('885')
            ? {}
            : (stryCov_9fa48('885'),
              {
                status: stryMutAct_9fa48('886') ? '' : (stryCov_9fa48('886'), 'paused'),
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('887') ? '' : (stryCov_9fa48('887'), '/api/plans/:id/resume'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('888')) {
          {
          }
        } else {
          stryCov_9fa48('888');
          const { id } = request.params as {
            id: string;
          };
          await planService.resumePlan(id);
          return stryMutAct_9fa48('889')
            ? {}
            : (stryCov_9fa48('889'),
              {
                status: stryMutAct_9fa48('890') ? '' : (stryCov_9fa48('890'), 'running'),
              });
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('891') ? '' : (stryCov_9fa48('891'), '/api/plans/:id/cancel'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('892')) {
          {
          }
        } else {
          stryCov_9fa48('892');
          const { id } = request.params as {
            id: string;
          };
          await planService.cancelPlan(id);
          return stryMutAct_9fa48('893')
            ? {}
            : (stryCov_9fa48('893'),
              {
                status: stryMutAct_9fa48('894') ? '' : (stryCov_9fa48('894'), 'cancelled'),
              });
        }
      }
    );
  }
}
