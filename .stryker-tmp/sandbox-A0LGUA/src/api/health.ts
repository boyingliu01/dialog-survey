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
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { error, info } from '../utils/logger.js';
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    db: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
    llm: {
      status: 'ok' | 'error' | 'degraded';
      latencyMs?: number;
      error?: string;
    };
    dingtalk: {
      status: 'ok' | 'error' | 'degraded';
      error?: string;
    };
  };
}
let prisma: PrismaClient | null = null;
let llmCacheTime: number | null = null;
function getPrisma(): PrismaClient {
  if (stryMutAct_9fa48('734')) {
    {
    }
  } else {
    stryCov_9fa48('734');
    if (
      stryMutAct_9fa48('737')
        ? false
        : stryMutAct_9fa48('736')
          ? true
          : stryMutAct_9fa48('735')
            ? prisma
            : (stryCov_9fa48('735', '736', '737'), !prisma)
    ) {
      if (stryMutAct_9fa48('738')) {
        {
        }
      } else {
        stryCov_9fa48('738');
        prisma = new PrismaClient();
      }
    }
    return prisma;
  }
}
async function checkDatabase(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}> {
  if (stryMutAct_9fa48('739')) {
    {
    }
  } else {
    stryCov_9fa48('739');
    try {
      if (stryMutAct_9fa48('740')) {
        {
        }
      } else {
        stryCov_9fa48('740');
        const start = Date.now();
        const db = getPrisma();
        await (stryMutAct_9fa48('741')
          ? db.$queryRaw``
          : (stryCov_9fa48('741'), db.$queryRaw`SELECT 1`));
        const latencyMs = stryMutAct_9fa48('742')
          ? Date.now() + start
          : (stryCov_9fa48('742'), Date.now() - start);
        return stryMutAct_9fa48('743')
          ? {}
          : (stryCov_9fa48('743'),
            {
              status: stryMutAct_9fa48('744') ? '' : (stryCov_9fa48('744'), 'ok'),
              latencyMs,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('745')) {
        {
        }
      } else {
        stryCov_9fa48('745');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('746')
              ? ''
              : (stryCov_9fa48('746'), 'Unknown error');
        error(
          stryMutAct_9fa48('747') ? '' : (stryCov_9fa48('747'), 'Database health check failed'),
          stryMutAct_9fa48('748')
            ? {}
            : (stryCov_9fa48('748'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('749')
          ? {}
          : (stryCov_9fa48('749'),
            {
              status: stryMutAct_9fa48('750') ? '' : (stryCov_9fa48('750'), 'error'),
              error: errMsg,
            });
      }
    }
  }
}
async function checkLLM(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  latencyMs?: number;
  error?: string;
}> {
  if (stryMutAct_9fa48('751')) {
    {
    }
  } else {
    stryCov_9fa48('751');
    if (
      stryMutAct_9fa48('754')
        ? llmCacheTime || Date.now() - llmCacheTime < 60000
        : stryMutAct_9fa48('753')
          ? false
          : stryMutAct_9fa48('752')
            ? true
            : (stryCov_9fa48('752', '753', '754'),
              llmCacheTime &&
                (stryMutAct_9fa48('757')
                  ? Date.now() - llmCacheTime >= 60000
                  : stryMutAct_9fa48('756')
                    ? Date.now() - llmCacheTime <= 60000
                    : stryMutAct_9fa48('755')
                      ? true
                      : (stryCov_9fa48('755', '756', '757'),
                        (stryMutAct_9fa48('758')
                          ? Date.now() + llmCacheTime
                          : (stryCov_9fa48('758'), Date.now() - llmCacheTime)) < 60000)))
    ) {
      if (stryMutAct_9fa48('759')) {
        {
        }
      } else {
        stryCov_9fa48('759');
        return stryMutAct_9fa48('760')
          ? {}
          : (stryCov_9fa48('760'),
            {
              status: stryMutAct_9fa48('761') ? '' : (stryCov_9fa48('761'), 'ok'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('762')) {
        {
        }
      } else {
        stryCov_9fa48('762');
        const apiKey = process.env.DASHSCOPE_API_KEY;
        if (
          stryMutAct_9fa48('765')
            ? !apiKey && apiKey === 'your-dashscope-api-key'
            : stryMutAct_9fa48('764')
              ? false
              : stryMutAct_9fa48('763')
                ? true
                : (stryCov_9fa48('763', '764', '765'),
                  (stryMutAct_9fa48('766') ? apiKey : (stryCov_9fa48('766'), !apiKey)) ||
                    (stryMutAct_9fa48('768')
                      ? apiKey !== 'your-dashscope-api-key'
                      : stryMutAct_9fa48('767')
                        ? false
                        : (stryCov_9fa48('767', '768'),
                          apiKey ===
                            (stryMutAct_9fa48('769')
                              ? ''
                              : (stryCov_9fa48('769'), 'your-dashscope-api-key')))))
        ) {
          if (stryMutAct_9fa48('770')) {
            {
            }
          } else {
            stryCov_9fa48('770');
            return stryMutAct_9fa48('771')
              ? {}
              : (stryCov_9fa48('771'),
                {
                  status: stryMutAct_9fa48('772') ? '' : (stryCov_9fa48('772'), 'degraded'),
                  error: stryMutAct_9fa48('773')
                    ? ''
                    : (stryCov_9fa48('773'), 'API key not configured'),
                });
          }
        }
        const start = Date.now();
        const response = await fetch(
          stryMutAct_9fa48('774')
            ? ''
            : (stryCov_9fa48('774'),
              'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding'),
          stryMutAct_9fa48('775')
            ? {}
            : (stryCov_9fa48('775'),
              {
                method: stryMutAct_9fa48('776') ? '' : (stryCov_9fa48('776'), 'POST'),
                headers: stryMutAct_9fa48('777')
                  ? {}
                  : (stryCov_9fa48('777'),
                    {
                      Authorization: stryMutAct_9fa48('778')
                        ? ``
                        : (stryCov_9fa48('778'), `Bearer ${apiKey}`),
                      'Content-Type': stryMutAct_9fa48('779')
                        ? ''
                        : (stryCov_9fa48('779'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('780')
                    ? {}
                    : (stryCov_9fa48('780'),
                      {
                        model: stryMutAct_9fa48('781')
                          ? ''
                          : (stryCov_9fa48('781'), 'text-embedding-v3'),
                        input: stryMutAct_9fa48('782')
                          ? ''
                          : (stryCov_9fa48('782'), 'health check'),
                      })
                ),
                signal: AbortSignal.timeout(5000),
              })
        );
        const latencyMs = stryMutAct_9fa48('783')
          ? Date.now() + start
          : (stryCov_9fa48('783'), Date.now() - start);
        if (
          stryMutAct_9fa48('785')
            ? false
            : stryMutAct_9fa48('784')
              ? true
              : (stryCov_9fa48('784', '785'), response.ok)
        ) {
          if (stryMutAct_9fa48('786')) {
            {
            }
          } else {
            stryCov_9fa48('786');
            llmCacheTime = Date.now();
            return stryMutAct_9fa48('787')
              ? {}
              : (stryCov_9fa48('787'),
                {
                  status: stryMutAct_9fa48('788') ? '' : (stryCov_9fa48('788'), 'ok'),
                  latencyMs,
                });
          }
        }
        return stryMutAct_9fa48('789')
          ? {}
          : (stryCov_9fa48('789'),
            {
              status: stryMutAct_9fa48('790') ? '' : (stryCov_9fa48('790'), 'degraded'),
              latencyMs,
              error: stryMutAct_9fa48('791')
                ? ``
                : (stryCov_9fa48('791'), `HTTP ${response.status}`),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('792')) {
        {
        }
      } else {
        stryCov_9fa48('792');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('793')
              ? ''
              : (stryCov_9fa48('793'), 'Unknown error');
        if (
          stryMutAct_9fa48('796')
            ? errMsg.includes('timeout') && errMsg.includes('abort')
            : stryMutAct_9fa48('795')
              ? false
              : stryMutAct_9fa48('794')
                ? true
                : (stryCov_9fa48('794', '795', '796'),
                  errMsg.includes(
                    stryMutAct_9fa48('797') ? '' : (stryCov_9fa48('797'), 'timeout')
                  ) ||
                    errMsg.includes(stryMutAct_9fa48('798') ? '' : (stryCov_9fa48('798'), 'abort')))
        ) {
          if (stryMutAct_9fa48('799')) {
            {
            }
          } else {
            stryCov_9fa48('799');
            return stryMutAct_9fa48('800')
              ? {}
              : (stryCov_9fa48('800'),
                {
                  status: stryMutAct_9fa48('801') ? '' : (stryCov_9fa48('801'), 'degraded'),
                  error: stryMutAct_9fa48('802') ? '' : (stryCov_9fa48('802'), 'timeout'),
                });
          }
        }
        error(
          stryMutAct_9fa48('803') ? '' : (stryCov_9fa48('803'), 'LLM health check failed'),
          stryMutAct_9fa48('804')
            ? {}
            : (stryCov_9fa48('804'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('805')
          ? {}
          : (stryCov_9fa48('805'),
            {
              status: stryMutAct_9fa48('806') ? '' : (stryCov_9fa48('806'), 'error'),
              error: errMsg,
            });
      }
    }
  }
}
async function checkDingTalk(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  error?: string;
}> {
  if (stryMutAct_9fa48('807')) {
    {
    }
  } else {
    stryCov_9fa48('807');
    const webhookUrl = process.env.DINGTALK_WEBHOOK_URL;
    if (
      stryMutAct_9fa48('810')
        ? !webhookUrl && webhookUrl.includes('xxx')
        : stryMutAct_9fa48('809')
          ? false
          : stryMutAct_9fa48('808')
            ? true
            : (stryCov_9fa48('808', '809', '810'),
              (stryMutAct_9fa48('811') ? webhookUrl : (stryCov_9fa48('811'), !webhookUrl)) ||
                webhookUrl.includes(stryMutAct_9fa48('812') ? '' : (stryCov_9fa48('812'), 'xxx')))
    ) {
      if (stryMutAct_9fa48('813')) {
        {
        }
      } else {
        stryCov_9fa48('813');
        return stryMutAct_9fa48('814')
          ? {}
          : (stryCov_9fa48('814'),
            {
              status: stryMutAct_9fa48('815') ? '' : (stryCov_9fa48('815'), 'degraded'),
              error: stryMutAct_9fa48('816')
                ? ''
                : (stryCov_9fa48('816'), 'Webhook not configured'),
            });
      }
    }
    return stryMutAct_9fa48('817')
      ? {}
      : (stryCov_9fa48('817'),
        {
          status: stryMutAct_9fa48('818') ? '' : (stryCov_9fa48('818'), 'ok'),
        });
  }
}
export async function healthRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('819')) {
    {
    }
  } else {
    stryCov_9fa48('819');
    fastify.get<{
      Reply: HealthResponse;
    }>(
      stryMutAct_9fa48('820') ? '' : (stryCov_9fa48('820'), '/health'),
      async (_request, reply) => {
        if (stryMutAct_9fa48('821')) {
          {
          }
        } else {
          stryCov_9fa48('821');
          info(stryMutAct_9fa48('822') ? '' : (stryCov_9fa48('822'), 'Health check requested'));
          const [dbCheck, llmCheck, dingtalkCheck] = await Promise.all(
            stryMutAct_9fa48('823')
              ? []
              : (stryCov_9fa48('823'), [checkDatabase(), checkLLM(), checkDingTalk()])
          );
          const dbOk = stryMutAct_9fa48('826')
            ? dbCheck.status !== 'ok'
            : stryMutAct_9fa48('825')
              ? false
              : stryMutAct_9fa48('824')
                ? true
                : (stryCov_9fa48('824', '825', '826'),
                  dbCheck.status === (stryMutAct_9fa48('827') ? '' : (stryCov_9fa48('827'), 'ok')));
          const llmOk = stryMutAct_9fa48('830')
            ? llmCheck.status !== 'ok'
            : stryMutAct_9fa48('829')
              ? false
              : stryMutAct_9fa48('828')
                ? true
                : (stryCov_9fa48('828', '829', '830'),
                  llmCheck.status ===
                    (stryMutAct_9fa48('831') ? '' : (stryCov_9fa48('831'), 'ok')));
          const dingtalkOk = stryMutAct_9fa48('834')
            ? dingtalkCheck.status !== 'ok'
            : stryMutAct_9fa48('833')
              ? false
              : stryMutAct_9fa48('832')
                ? true
                : (stryCov_9fa48('832', '833', '834'),
                  dingtalkCheck.status ===
                    (stryMutAct_9fa48('835') ? '' : (stryCov_9fa48('835'), 'ok')));
          let status: 'healthy' | 'degraded' | 'unhealthy';
          if (
            stryMutAct_9fa48('838')
              ? (dbOk && llmOk) || dingtalkOk
              : stryMutAct_9fa48('837')
                ? false
                : stryMutAct_9fa48('836')
                  ? true
                  : (stryCov_9fa48('836', '837', '838'),
                    (stryMutAct_9fa48('840')
                      ? dbOk || llmOk
                      : stryMutAct_9fa48('839')
                        ? true
                        : (stryCov_9fa48('839', '840'), dbOk && llmOk)) && dingtalkOk)
          ) {
            if (stryMutAct_9fa48('841')) {
              {
              }
            } else {
              stryCov_9fa48('841');
              status = stryMutAct_9fa48('842') ? '' : (stryCov_9fa48('842'), 'healthy');
            }
          } else if (
            stryMutAct_9fa48('844')
              ? false
              : stryMutAct_9fa48('843')
                ? true
                : (stryCov_9fa48('843', '844'), dbOk)
          ) {
            if (stryMutAct_9fa48('845')) {
              {
              }
            } else {
              stryCov_9fa48('845');
              status = stryMutAct_9fa48('846') ? '' : (stryCov_9fa48('846'), 'degraded');
            }
          } else {
            if (stryMutAct_9fa48('847')) {
              {
              }
            } else {
              stryCov_9fa48('847');
              status = stryMutAct_9fa48('848') ? '' : (stryCov_9fa48('848'), 'unhealthy');
            }
          }
          const response: HealthResponse = stryMutAct_9fa48('849')
            ? {}
            : (stryCov_9fa48('849'),
              {
                status,
                timestamp: new Date().toISOString(),
                checks: stryMutAct_9fa48('850')
                  ? {}
                  : (stryCov_9fa48('850'),
                    {
                      db: dbCheck,
                      llm: llmCheck,
                      dingtalk: dingtalkCheck,
                    }),
              });
          const statusCode = (
            stryMutAct_9fa48('853')
              ? status !== 'healthy'
              : stryMutAct_9fa48('852')
                ? false
                : stryMutAct_9fa48('851')
                  ? true
                  : (stryCov_9fa48('851', '852', '853'),
                    status === (stryMutAct_9fa48('854') ? '' : (stryCov_9fa48('854'), 'healthy')))
          )
            ? 200
            : (
                  stryMutAct_9fa48('857')
                    ? status !== 'degraded'
                    : stryMutAct_9fa48('856')
                      ? false
                      : stryMutAct_9fa48('855')
                        ? true
                        : (stryCov_9fa48('855', '856', '857'),
                          status ===
                            (stryMutAct_9fa48('858') ? '' : (stryCov_9fa48('858'), 'degraded')))
                )
              ? 200
              : 503;
          return reply.status(statusCode).send(response);
        }
      }
    );
  }
}
