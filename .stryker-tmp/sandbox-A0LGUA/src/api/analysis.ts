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
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalysisService } from '../services/analysis.service.js';
const analyzeSingleSchema = z.object(
  stryMutAct_9fa48('655')
    ? {}
    : (stryCov_9fa48('655'),
      {
        interviewId: z.string().uuid(),
      })
);
export async function analysisRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('656')) {
    {
    }
  } else {
    stryCov_9fa48('656');
    const analysisService = new AnalysisService();
    fastify.post(
      stryMutAct_9fa48('657') ? '' : (stryCov_9fa48('657'), '/api/analysis/single'),
      async (request, reply) => {
        if (stryMutAct_9fa48('658')) {
          {
          }
        } else {
          stryCov_9fa48('658');
          const { interviewId } = analyzeSingleSchema.parse(request.body);
          try {
            if (stryMutAct_9fa48('659')) {
              {
              }
            } else {
              stryCov_9fa48('659');
              const result = await analysisService.analyzeInterview(interviewId);
              return result;
            }
          } catch (e) {
            if (stryMutAct_9fa48('660')) {
              {
              }
            } else {
              stryCov_9fa48('660');
              const errorMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('661')
                    ? ''
                    : (stryCov_9fa48('661'), 'Unknown error');
              return reply.status(500).send(
                stryMutAct_9fa48('662')
                  ? {}
                  : (stryCov_9fa48('662'),
                    {
                      error: errorMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('663') ? '' : (stryCov_9fa48('663'), '/api/analysis/batch'),
      async (request, reply) => {
        if (stryMutAct_9fa48('664')) {
          {
          }
        } else {
          stryCov_9fa48('664');
          const { planId } = request.body as {
            planId: string;
          };
          if (
            stryMutAct_9fa48('667')
              ? false
              : stryMutAct_9fa48('666')
                ? true
                : stryMutAct_9fa48('665')
                  ? planId
                  : (stryCov_9fa48('665', '666', '667'), !planId)
          ) {
            if (stryMutAct_9fa48('668')) {
              {
              }
            } else {
              stryCov_9fa48('668');
              return reply.status(400).send(
                stryMutAct_9fa48('669')
                  ? {}
                  : (stryCov_9fa48('669'),
                    {
                      error: stryMutAct_9fa48('670')
                        ? ''
                        : (stryCov_9fa48('670'), 'planId is required'),
                    })
              );
            }
          }
          try {
            if (stryMutAct_9fa48('671')) {
              {
              }
            } else {
              stryCov_9fa48('671');
              const results = await analysisService.batchAnalyze(planId);
              return stryMutAct_9fa48('672')
                ? {}
                : (stryCov_9fa48('672'),
                  {
                    total: results.length,
                    results: results.map(
                      stryMutAct_9fa48('673')
                        ? () => undefined
                        : (stryCov_9fa48('673'),
                          (r) =>
                            stryMutAct_9fa48('674')
                              ? {}
                              : (stryCov_9fa48('674'),
                                {
                                  interviewId: r.interviewId,
                                  metrics: r.metrics,
                                }))
                    ),
                  });
            }
          } catch (e) {
            if (stryMutAct_9fa48('675')) {
              {
              }
            } else {
              stryCov_9fa48('675');
              const errorMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('676')
                    ? ''
                    : (stryCov_9fa48('676'), 'Unknown error');
              return reply.status(500).send(
                stryMutAct_9fa48('677')
                  ? {}
                  : (stryCov_9fa48('677'),
                    {
                      error: errorMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('678') ? '' : (stryCov_9fa48('678'), '/api/analysis/cluster/:planId'),
      async (request, reply) => {
        if (stryMutAct_9fa48('679')) {
          {
          }
        } else {
          stryCov_9fa48('679');
          const { planId } = request.params as {
            planId: string;
          };
          try {
            if (stryMutAct_9fa48('680')) {
              {
              }
            } else {
              stryCov_9fa48('680');
              const clusters = await analysisService.compareClusters(
                stryMutAct_9fa48('681') ? [] : (stryCov_9fa48('681'), [planId])
              );
              return stryMutAct_9fa48('682')
                ? {}
                : (stryCov_9fa48('682'),
                  {
                    clusters,
                  });
            }
          } catch (e) {
            if (stryMutAct_9fa48('683')) {
              {
              }
            } else {
              stryCov_9fa48('683');
              const errorMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('684')
                    ? ''
                    : (stryCov_9fa48('684'), 'Unknown error');
              return reply.status(500).send(
                stryMutAct_9fa48('685')
                  ? {}
                  : (stryCov_9fa48('685'),
                    {
                      error: errorMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('686') ? '' : (stryCov_9fa48('686'), '/api/analysis/report/:interviewId'),
      async (request, reply) => {
        if (stryMutAct_9fa48('687')) {
          {
          }
        } else {
          stryCov_9fa48('687');
          const { interviewId } = request.params as {
            interviewId: string;
          };
          const report = await analysisService.getReportByInterviewId(interviewId);
          if (
            stryMutAct_9fa48('690')
              ? false
              : stryMutAct_9fa48('689')
                ? true
                : stryMutAct_9fa48('688')
                  ? report
                  : (stryCov_9fa48('688', '689', '690'), !report)
          ) {
            if (stryMutAct_9fa48('691')) {
              {
              }
            } else {
              stryCov_9fa48('691');
              return reply.status(404).send(
                stryMutAct_9fa48('692')
                  ? {}
                  : (stryCov_9fa48('692'),
                    {
                      error: stryMutAct_9fa48('693')
                        ? ''
                        : (stryCov_9fa48('693'), 'Report not found'),
                    })
              );
            }
          }
          return report;
        }
      }
    );
    fastify.post(
      stryMutAct_9fa48('694') ? '' : (stryCov_9fa48('694'), '/api/analysis/aggregate/:planId'),
      async (request, reply) => {
        if (stryMutAct_9fa48('695')) {
          {
          }
        } else {
          stryCov_9fa48('695');
          const { planId } = request.params as {
            planId: string;
          };
          const prisma = analysisService.prisma;
          try {
            if (stryMutAct_9fa48('696')) {
              {
              }
            } else {
              stryCov_9fa48('696');
              const existing = (await prisma.batchAnalysisReport.findFirst({
                where: {
                  planId,
                  status: 'RUNNING',
                },
              })) as {
                id: string;
              } | null;
              if (
                stryMutAct_9fa48('698')
                  ? false
                  : stryMutAct_9fa48('697')
                    ? true
                    : (stryCov_9fa48('697', '698'), existing)
              ) {
                if (stryMutAct_9fa48('699')) {
                  {
                  }
                } else {
                  stryCov_9fa48('699');
                  return reply.status(409).send(
                    stryMutAct_9fa48('700')
                      ? {}
                      : (stryCov_9fa48('700'),
                        {
                          error: stryMutAct_9fa48('701')
                            ? ''
                            : (stryCov_9fa48('701'), 'Aggregate analysis already running'),
                          existingReportId: existing.id,
                        })
                  );
                }
              }
              const completed = (await prisma.interview.findFirst({
                where: {
                  planId,
                  status: 'COMPLETED',
                },
              })) as {
                id: string;
              } | null;
              if (
                stryMutAct_9fa48('704')
                  ? false
                  : stryMutAct_9fa48('703')
                    ? true
                    : stryMutAct_9fa48('702')
                      ? completed
                      : (stryCov_9fa48('702', '703', '704'), !completed)
              ) {
                if (stryMutAct_9fa48('705')) {
                  {
                  }
                } else {
                  stryCov_9fa48('705');
                  return reply.status(400).send(
                    stryMutAct_9fa48('706')
                      ? {}
                      : (stryCov_9fa48('706'),
                        {
                          error: stryMutAct_9fa48('707')
                            ? ''
                            : (stryCov_9fa48('707'), 'No COMPLETED interviews found in this plan'),
                        })
                  );
                }
              }
              const plan = (await prisma.interviewPlan.findUnique({
                where: {
                  id: planId,
                },
                select: {
                  templateId: true,
                },
              })) as {
                templateId: string;
              } | null;
              if (
                stryMutAct_9fa48('710')
                  ? false
                  : stryMutAct_9fa48('709')
                    ? true
                    : stryMutAct_9fa48('708')
                      ? plan
                      : (stryCov_9fa48('708', '709', '710'), !plan)
              ) {
                if (stryMutAct_9fa48('711')) {
                  {
                  }
                } else {
                  stryCov_9fa48('711');
                  return reply.status(404).send(
                    stryMutAct_9fa48('712')
                      ? {}
                      : (stryCov_9fa48('712'),
                        {
                          error: stryMutAct_9fa48('713')
                            ? ''
                            : (stryCov_9fa48('713'), 'Plan not found'),
                        })
                  );
                }
              }
              const report = (await prisma.batchAnalysisReport.create({
                data: {
                  planId,
                  templateId: plan.templateId,
                  type: 'SUMMARY',
                  status: 'PENDING',
                  content: '',
                  metrics: {},
                  topics: {},
                  emergents: [],
                },
              })) as {
                id: string;
                status: string;
              };
              return reply.status(201).send(
                stryMutAct_9fa48('714')
                  ? {}
                  : (stryCov_9fa48('714'),
                    {
                      batchReportId: report.id,
                      status: report.status,
                    })
              );
            }
          } catch (e) {
            if (stryMutAct_9fa48('715')) {
              {
              }
            } else {
              stryCov_9fa48('715');
              const errorMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('716')
                    ? ''
                    : (stryCov_9fa48('716'), 'Unknown error');
              return reply.status(500).send(
                stryMutAct_9fa48('717')
                  ? {}
                  : (stryCov_9fa48('717'),
                    {
                      error: errorMsg,
                    })
              );
            }
          }
        }
      }
    );
    fastify.get(
      stryMutAct_9fa48('718')
        ? ''
        : (stryCov_9fa48('718'), '/api/analysis/aggregate/:batchReportId'),
      async (request, reply) => {
        if (stryMutAct_9fa48('719')) {
          {
          }
        } else {
          stryCov_9fa48('719');
          const { batchReportId } = request.params as {
            batchReportId: string;
          };
          try {
            if (stryMutAct_9fa48('720')) {
              {
              }
            } else {
              stryCov_9fa48('720');
              const report = await analysisService.prisma.batchAnalysisReport.findUnique(
                stryMutAct_9fa48('721')
                  ? {}
                  : (stryCov_9fa48('721'),
                    {
                      where: stryMutAct_9fa48('722')
                        ? {}
                        : (stryCov_9fa48('722'),
                          {
                            id: batchReportId,
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('725')
                  ? false
                  : stryMutAct_9fa48('724')
                    ? true
                    : stryMutAct_9fa48('723')
                      ? report
                      : (stryCov_9fa48('723', '724', '725'), !report)
              ) {
                if (stryMutAct_9fa48('726')) {
                  {
                  }
                } else {
                  stryCov_9fa48('726');
                  return reply.status(404).send(
                    stryMutAct_9fa48('727')
                      ? {}
                      : (stryCov_9fa48('727'),
                        {
                          error: stryMutAct_9fa48('728')
                            ? ''
                            : (stryCov_9fa48('728'), 'Aggregate report not found'),
                        })
                  );
                }
              }
              return reply.status(200).send(report);
            }
          } catch (e) {
            if (stryMutAct_9fa48('729')) {
              {
              }
            } else {
              stryCov_9fa48('729');
              const errorMsg =
                e instanceof Error
                  ? e.message
                  : stryMutAct_9fa48('730')
                    ? ''
                    : (stryCov_9fa48('730'), 'Unknown error');
              fastify.log.error(
                stryMutAct_9fa48('731')
                  ? {}
                  : (stryCov_9fa48('731'),
                    {
                      error: errorMsg,
                    }),
                stryMutAct_9fa48('732')
                  ? ''
                  : (stryCov_9fa48('732'), 'GET aggregate endpoint error')
              );
              return reply.status(500).send(
                stryMutAct_9fa48('733')
                  ? {}
                  : (stryCov_9fa48('733'),
                    {
                      error: errorMsg,
                    })
              );
            }
          }
        }
      }
    );
  }
}
