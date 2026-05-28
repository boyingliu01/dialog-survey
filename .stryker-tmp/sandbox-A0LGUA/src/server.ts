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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyView from '@fastify/view';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { adminTemplatesRoutes } from './api/admin-templates.js';
import { analysisRoutes } from './api/analysis.js';
import { healthRoutes } from './api/health.js';
import { interviewPlanRoutes } from './api/plans.js';
import { templateRoutes } from './api/templates.js';
import { webhookRoutes } from './api/webhook.js';
import { DingTalkStreamClient } from './integrations/dingtalk/stream-client.js';
import { type StreamMessage, processStreamMessage } from './services/stream-message.service.js';
import { error, info } from './utils/logger.js';
import { securityMiddleware } from './utils/security.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_CHECK_TIMEOUT_MS = 5000;
async function checkDatabaseConnection(): Promise<boolean> {
  if (stryMutAct_9fa48('2395')) {
    {
    }
  } else {
    stryCov_9fa48('2395');
    const prisma = new PrismaClient();
    try {
      if (stryMutAct_9fa48('2396')) {
        {
        }
      } else {
        stryCov_9fa48('2396');
        await Promise.race(
          stryMutAct_9fa48('2397')
            ? []
            : (stryCov_9fa48('2397'),
              [
                stryMutAct_9fa48('2398')
                  ? prisma.$queryRaw``
                  : (stryCov_9fa48('2398'), prisma.$queryRaw`SELECT 1`),
                new Promise(
                  stryMutAct_9fa48('2399')
                    ? () => undefined
                    : (stryCov_9fa48('2399'),
                      (_, reject) =>
                        setTimeout(
                          stryMutAct_9fa48('2400')
                            ? () => undefined
                            : (stryCov_9fa48('2400'),
                              () =>
                                reject(
                                  new Error(
                                    stryMutAct_9fa48('2401')
                                      ? ''
                                      : (stryCov_9fa48('2401'), 'Database connection timeout')
                                  )
                                )),
                          DB_CHECK_TIMEOUT_MS
                        ))
                ),
              ])
        );
        info(stryMutAct_9fa48('2402') ? '' : (stryCov_9fa48('2402'), 'Database connection OK'));
        return stryMutAct_9fa48('2403') ? false : (stryCov_9fa48('2403'), true);
      }
    } catch (err) {
      if (stryMutAct_9fa48('2404')) {
        {
        }
      } else {
        stryCov_9fa48('2404');
        const errMsg = err instanceof Error ? err.message : String(err);
        error(
          stryMutAct_9fa48('2405') ? '' : (stryCov_9fa48('2405'), 'Database connection FAILED'),
          stryMutAct_9fa48('2406')
            ? {}
            : (stryCov_9fa48('2406'),
              {
                error: errMsg,
              })
        );
        error(
          stryMutAct_9fa48('2407')
            ? ''
            : (stryCov_9fa48('2407'), 'PostgreSQL must be running before starting the server')
        );
        error(
          stryMutAct_9fa48('2408')
            ? ''
            : (stryCov_9fa48('2408'), 'Run: sudo systemctl start postgresql')
        );
        return stryMutAct_9fa48('2409') ? true : (stryCov_9fa48('2409'), false);
      }
    } finally {
      if (stryMutAct_9fa48('2410')) {
        {
        }
      } else {
        stryCov_9fa48('2410');
        await prisma.$disconnect();
      }
    }
  }
}
export async function buildApp() {
  if (stryMutAct_9fa48('2411')) {
    {
    }
  } else {
    stryCov_9fa48('2411');
    const fastify = Fastify(
      stryMutAct_9fa48('2412')
        ? {}
        : (stryCov_9fa48('2412'),
          {
            logger: stryMutAct_9fa48('2413')
              ? {}
              : (stryCov_9fa48('2413'),
                {
                  transport: stryMutAct_9fa48('2414')
                    ? {}
                    : (stryCov_9fa48('2414'),
                      {
                        target: stryMutAct_9fa48('2415')
                          ? ''
                          : (stryCov_9fa48('2415'), 'pino-pretty'),
                        options: stryMutAct_9fa48('2416')
                          ? {}
                          : (stryCov_9fa48('2416'),
                            {
                              translateTime: stryMutAct_9fa48('2417')
                                ? ''
                                : (stryCov_9fa48('2417'), 'HH:MM:ss Z'),
                              ignore: stryMutAct_9fa48('2418')
                                ? ''
                                : (stryCov_9fa48('2418'), 'pid,hostname'),
                            }),
                      }),
                }),
          })
    );
    fastify.addContentTypeParser(
      stryMutAct_9fa48('2419') ? '' : (stryCov_9fa48('2419'), '*'),
      stryMutAct_9fa48('2420')
        ? {}
        : (stryCov_9fa48('2420'),
          {
            parseAs: stryMutAct_9fa48('2421') ? '' : (stryCov_9fa48('2421'), 'string'),
          }),
      (_req, _body, done) => {
        if (stryMutAct_9fa48('2422')) {
          {
          }
        } else {
          stryCov_9fa48('2422');
          done(null, stryMutAct_9fa48('2423') ? 'Stryker was here!' : (stryCov_9fa48('2423'), ''));
        }
      }
    );
    await fastify.register(
      cors,
      stryMutAct_9fa48('2424')
        ? {}
        : (stryCov_9fa48('2424'),
          {
            origin: stryMutAct_9fa48('2425') ? false : (stryCov_9fa48('2425'), true),
          })
    );
    const viewsDir = resolve(
      __dirname,
      stryMutAct_9fa48('2426') ? '' : (stryCov_9fa48('2426'), '..'),
      stryMutAct_9fa48('2427') ? '' : (stryCov_9fa48('2427'), 'src'),
      stryMutAct_9fa48('2428') ? '' : (stryCov_9fa48('2428'), 'views')
    );
    await fastify.register(
      fastifyView,
      stryMutAct_9fa48('2429')
        ? {}
        : (stryCov_9fa48('2429'),
          {
            engine: stryMutAct_9fa48('2430')
              ? {}
              : (stryCov_9fa48('2430'),
                {
                  nunjucks,
                }),
            templates: viewsDir,
            options: stryMutAct_9fa48('2431')
              ? {}
              : (stryCov_9fa48('2431'),
                {
                  autoescape: stryMutAct_9fa48('2432') ? false : (stryCov_9fa48('2432'), true),
                  noCache: stryMutAct_9fa48('2433') ? false : (stryCov_9fa48('2433'), true),
                }),
          })
    );
    await securityMiddleware(fastify);
    await fastify.register(healthRoutes);
    await fastify.register(webhookRoutes);
    await fastify.register(interviewPlanRoutes);
    await fastify.register(templateRoutes);
    await fastify.register(analysisRoutes);
    await fastify.register(adminTemplatesRoutes);
    return fastify;
  }
}
export async function startServer() {
  if (stryMutAct_9fa48('2434')) {
    {
    }
  } else {
    stryCov_9fa48('2434');
    const dbOk = await checkDatabaseConnection();
    if (
      stryMutAct_9fa48('2437')
        ? false
        : stryMutAct_9fa48('2436')
          ? true
          : stryMutAct_9fa48('2435')
            ? dbOk
            : (stryCov_9fa48('2435', '2436', '2437'), !dbOk)
    ) {
      if (stryMutAct_9fa48('2438')) {
        {
        }
      } else {
        stryCov_9fa48('2438');
        process.exit(1);
      }
    }
    const app = await buildApp();
    try {
      if (stryMutAct_9fa48('2439')) {
        {
        }
      } else {
        stryCov_9fa48('2439');
        await app.listen(
          stryMutAct_9fa48('2440')
            ? {}
            : (stryCov_9fa48('2440'),
              {
                port: 3000,
                host: stryMutAct_9fa48('2441') ? '' : (stryCov_9fa48('2441'), '0.0.0.0'),
              })
        );
        const clientId = process.env.DINGTALK_CLIENT_ID;
        const clientSecret = process.env.DINGTALK_CLIENT_SECRET;
        const agentId = process.env.DINGTALK_AGENT_ID;
        if (
          stryMutAct_9fa48('2444')
            ? (clientId && clientSecret) || agentId
            : stryMutAct_9fa48('2443')
              ? false
              : stryMutAct_9fa48('2442')
                ? true
                : (stryCov_9fa48('2442', '2443', '2444'),
                  (stryMutAct_9fa48('2446')
                    ? clientId || clientSecret
                    : stryMutAct_9fa48('2445')
                      ? true
                      : (stryCov_9fa48('2445', '2446'), clientId && clientSecret)) && agentId)
        ) {
          if (stryMutAct_9fa48('2447')) {
            {
            }
          } else {
            stryCov_9fa48('2447');
            const client = DingTalkStreamClient.fromEnv();
            client.on(stryMutAct_9fa48('2448') ? '' : (stryCov_9fa48('2448'), 'connected'), () => {
              if (stryMutAct_9fa48('2449')) {
                {
                }
              } else {
                stryCov_9fa48('2449');
                info(
                  stryMutAct_9fa48('2450')
                    ? ''
                    : (stryCov_9fa48('2450'), 'DingTalk Stream connected')
                );
              }
            });
            client.on(
              stryMutAct_9fa48('2451') ? '' : (stryCov_9fa48('2451'), 'message'),
              (message: unknown) => {
                if (stryMutAct_9fa48('2452')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2452');
                  info(
                    stryMutAct_9fa48('2453')
                      ? ''
                      : (stryCov_9fa48('2453'), 'Received DingTalk message'),
                    stryMutAct_9fa48('2454')
                      ? {}
                      : (stryCov_9fa48('2454'),
                        {
                          topic: stryMutAct_9fa48('2456')
                            ? (message as StreamMessage).headers?.topic
                            : stryMutAct_9fa48('2455')
                              ? (message as StreamMessage)?.headers.topic
                              : (stryCov_9fa48('2455', '2456'),
                                (message as StreamMessage)?.headers?.topic),
                          messageId: stryMutAct_9fa48('2458')
                            ? (message as StreamMessage).headers?.messageId
                            : stryMutAct_9fa48('2457')
                              ? (message as StreamMessage)?.headers.messageId
                              : (stryCov_9fa48('2457', '2458'),
                                (message as StreamMessage)?.headers?.messageId),
                        })
                  );
                  processStreamMessage(message as StreamMessage).catch((err) => {
                    if (stryMutAct_9fa48('2459')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('2459');
                      const errMsg = err instanceof Error ? err.message : String(err);
                      error(
                        stryMutAct_9fa48('2460')
                          ? ''
                          : (stryCov_9fa48('2460'), 'Failed to process message'),
                        stryMutAct_9fa48('2461')
                          ? {}
                          : (stryCov_9fa48('2461'),
                            {
                              error: errMsg,
                            })
                      );
                    }
                  });
                }
              }
            );
            client.on(
              stryMutAct_9fa48('2462') ? '' : (stryCov_9fa48('2462'), 'error'),
              (err: unknown) => {
                if (stryMutAct_9fa48('2463')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2463');
                  const errMsg = err instanceof Error ? err.message : String(err);
                  error(
                    stryMutAct_9fa48('2464')
                      ? ''
                      : (stryCov_9fa48('2464'), 'DingTalk Stream error'),
                    stryMutAct_9fa48('2465')
                      ? {}
                      : (stryCov_9fa48('2465'),
                        {
                          error: errMsg,
                        })
                  );
                }
              }
            );
            client.on(
              stryMutAct_9fa48('2466') ? '' : (stryCov_9fa48('2466'), 'disconnected'),
              () => {
                if (stryMutAct_9fa48('2467')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2467');
                  info(
                    stryMutAct_9fa48('2468')
                      ? ''
                      : (stryCov_9fa48('2468'), 'DingTalk Stream disconnected')
                  );
                }
              }
            );
            await client.connect();
            const gracefulShutdown = async (signal: string) => {
              if (stryMutAct_9fa48('2469')) {
                {
                }
              } else {
                stryCov_9fa48('2469');
                info(
                  stryMutAct_9fa48('2470')
                    ? ``
                    : (stryCov_9fa48('2470'), `Received ${signal}, shutting down gracefully`)
                );
                client.disconnect();
                await app.close();
                process.exit(0);
              }
            };
            process.on(
              stryMutAct_9fa48('2471') ? '' : (stryCov_9fa48('2471'), 'SIGTERM'),
              stryMutAct_9fa48('2472')
                ? () => undefined
                : (stryCov_9fa48('2472'),
                  () =>
                    gracefulShutdown(
                      stryMutAct_9fa48('2473') ? '' : (stryCov_9fa48('2473'), 'SIGTERM')
                    ))
            );
            process.on(
              stryMutAct_9fa48('2474') ? '' : (stryCov_9fa48('2474'), 'SIGINT'),
              stryMutAct_9fa48('2475')
                ? () => undefined
                : (stryCov_9fa48('2475'),
                  () =>
                    gracefulShutdown(
                      stryMutAct_9fa48('2476') ? '' : (stryCov_9fa48('2476'), 'SIGINT')
                    ))
            );
          }
        } else {
          if (stryMutAct_9fa48('2477')) {
            {
            }
          } else {
            stryCov_9fa48('2477');
            info(
              stryMutAct_9fa48('2478')
                ? ''
                : (stryCov_9fa48('2478'),
                  'DingTalk Stream mode not configured, skipping WebSocket connection')
            );
          }
        }
        return app;
      }
    } catch (err) {
      if (stryMutAct_9fa48('2479')) {
        {
        }
      } else {
        stryCov_9fa48('2479');
        app.log.error(err);
        process.exit(1);
      }
    }
  }
}
if (
  stryMutAct_9fa48('2482')
    ? import.meta.url !== `file://${process.argv[1]}`
    : stryMutAct_9fa48('2481')
      ? false
      : stryMutAct_9fa48('2480')
        ? true
        : (stryCov_9fa48('2480', '2481', '2482'),
          import.meta.url ===
            (stryMutAct_9fa48('2483') ? `` : (stryCov_9fa48('2483'), `file://${process.argv[1]}`)))
) {
  if (stryMutAct_9fa48('2484')) {
    {
    }
  } else {
    stryCov_9fa48('2484');
    startServer();
  }
}
