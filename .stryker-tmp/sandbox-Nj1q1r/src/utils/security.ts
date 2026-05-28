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
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
const prisma = new PrismaClient();
export interface AuthUser {
  userId: string;
  role: 'admin' | 'user';
  apiKeyId?: string;
}
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
  if (stryMutAct_9fa48('724')) {
    {
    }
  } else {
    stryCov_9fa48('724');
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (
      stryMutAct_9fa48('727')
        ? false
        : stryMutAct_9fa48('726')
          ? true
          : stryMutAct_9fa48('725')
            ? apiKey
            : (stryCov_9fa48('725', '726', '727'), !apiKey)
    ) {
      if (stryMutAct_9fa48('728')) {
        {
        }
      } else {
        stryCov_9fa48('728');
        return reply.status(401).send(
          stryMutAct_9fa48('729')
            ? {}
            : (stryCov_9fa48('729'),
              {
                error: stryMutAct_9fa48('730') ? '' : (stryCov_9fa48('730'), 'API key required'),
              })
        );
      }
    }
    const keyRecord = await prisma.auditLog.findFirst(
      stryMutAct_9fa48('731')
        ? {}
        : (stryCov_9fa48('731'),
          {
            where: stryMutAct_9fa48('732')
              ? {}
              : (stryCov_9fa48('732'),
                {
                  action: stryMutAct_9fa48('733') ? '' : (stryCov_9fa48('733'), 'API_KEY_CREATED'),
                  details: stryMutAct_9fa48('734')
                    ? {}
                    : (stryCov_9fa48('734'),
                      {
                        contains: stryMutAct_9fa48('735')
                          ? apiKey
                          : (stryCov_9fa48('735'), apiKey.substring(0, 8)),
                      }),
                }),
          })
    );
    if (
      stryMutAct_9fa48('738')
        ? false
        : stryMutAct_9fa48('737')
          ? true
          : stryMutAct_9fa48('736')
            ? keyRecord
            : (stryCov_9fa48('736', '737', '738'), !keyRecord)
    ) {
      if (stryMutAct_9fa48('739')) {
        {
        }
      } else {
        stryCov_9fa48('739');
        return reply.status(401).send(
          stryMutAct_9fa48('740')
            ? {}
            : (stryCov_9fa48('740'),
              {
                error: stryMutAct_9fa48('741') ? '' : (stryCov_9fa48('741'), 'Invalid API key'),
              })
        );
      }
    }
    request.user = stryMutAct_9fa48('742')
      ? {}
      : (stryCov_9fa48('742'),
        {
          userId: stryMutAct_9fa48('745')
            ? keyRecord.userId && 'unknown'
            : stryMutAct_9fa48('744')
              ? false
              : stryMutAct_9fa48('743')
                ? true
                : (stryCov_9fa48('743', '744', '745'),
                  keyRecord.userId ||
                    (stryMutAct_9fa48('746') ? '' : (stryCov_9fa48('746'), 'unknown'))),
          role: stryMutAct_9fa48('747') ? '' : (stryCov_9fa48('747'), 'user'),
        });
  }
}
export async function logSecurityEvent(params: {
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  if (stryMutAct_9fa48('748')) {
    {
    }
  } else {
    stryCov_9fa48('748');
    await prisma.auditLog.create(
      stryMutAct_9fa48('749')
        ? {}
        : (stryCov_9fa48('749'),
          {
            data: stryMutAct_9fa48('750')
              ? {}
              : (stryCov_9fa48('750'),
                {
                  action: params.action,
                  entityType: params.entityType,
                  entityId: params.entityId,
                  userId: params.userId,
                  details: params.details ? JSON.stringify(params.details) : undefined,
                  ipAddress: params.ipAddress,
                }),
          })
    );
  }
}
export function anonymizeData(data: string): string {
  if (stryMutAct_9fa48('751')) {
    {
    }
  } else {
    stryCov_9fa48('751');
    const patterns = stryMutAct_9fa48('752')
      ? []
      : (stryCov_9fa48('752'),
        [
          stryMutAct_9fa48('753')
            ? {}
            : (stryCov_9fa48('753'),
              {
                regex: stryMutAct_9fa48('756')
                  ? /1[3-9]\D{9}/g
                  : stryMutAct_9fa48('755')
                    ? /1[3-9]\d/g
                    : stryMutAct_9fa48('754')
                      ? /1[^3-9]\d{9}/g
                      : (stryCov_9fa48('754', '755', '756'), /1[3-9]\d{9}/g),
                replacement: stryMutAct_9fa48('757') ? '' : (stryCov_9fa48('757'), '1XXXXXXXXXX'),
              }),
          stryMutAct_9fa48('758')
            ? {}
            : (stryCov_9fa48('758'),
              {
                regex: stryMutAct_9fa48('764')
                  ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[^A-Z|a-z]{2,}\b/g
                  : stryMutAct_9fa48('763')
                    ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]\b/g
                    : stryMutAct_9fa48('762')
                      ? /\b[A-Za-z0-9._%+-]+@[^A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                      : stryMutAct_9fa48('761')
                        ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]\.[A-Z|a-z]{2,}\b/g
                        : stryMutAct_9fa48('760')
                          ? /\b[^A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                          : stryMutAct_9fa48('759')
                            ? /\b[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                            : (stryCov_9fa48('759', '760', '761', '762', '763', '764'),
                              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
                replacement: stryMutAct_9fa48('765') ? '' : (stryCov_9fa48('765'), 'xxx@xxx.xxx'),
              }),
          stryMutAct_9fa48('766')
            ? {}
            : (stryCov_9fa48('766'),
              {
                regex: stryMutAct_9fa48('770')
                  ? /\b\d{17}[\DXx]\b/g
                  : stryMutAct_9fa48('769')
                    ? /\b\d{17}[^\dXx]\b/g
                    : stryMutAct_9fa48('768')
                      ? /\b\D{17}[\dXx]\b/g
                      : stryMutAct_9fa48('767')
                        ? /\b\d[\dXx]\b/g
                        : (stryCov_9fa48('767', '768', '769', '770'), /\b\d{17}[\dXx]\b/g),
                replacement: stryMutAct_9fa48('771')
                  ? ''
                  : (stryCov_9fa48('771'), 'XXXXXXXXXXXXXXXXX'),
              }),
        ]);
    let result = data;
    for (const { regex, replacement } of patterns) {
      if (stryMutAct_9fa48('772')) {
        {
        }
      } else {
        stryCov_9fa48('772');
        result = result.replace(regex, replacement);
      }
    }
    return result;
  }
}
export function generateApiKey(): string {
  if (stryMutAct_9fa48('773')) {
    {
    }
  } else {
    stryCov_9fa48('773');
    return stryMutAct_9fa48('774')
      ? ``
      : (stryCov_9fa48('774'),
        `ib_${crypto.randomBytes(32).toString(stryMutAct_9fa48('775') ? '' : (stryCov_9fa48('775'), 'hex'))}`);
  }
}
export async function securityMiddleware(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('776')) {
    {
    }
  } else {
    stryCov_9fa48('776');
    fastify.addHook(
      stryMutAct_9fa48('777') ? '' : (stryCov_9fa48('777'), 'onRequest'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('778')) {
          {
          }
        } else {
          stryCov_9fa48('778');
          const path = request.url;
          if (
            stryMutAct_9fa48('781')
              ? path.startsWith('/health') && path.startsWith('/webhook')
              : stryMutAct_9fa48('780')
                ? false
                : stryMutAct_9fa48('779')
                  ? true
                  : (stryCov_9fa48('779', '780', '781'),
                    (stryMutAct_9fa48('782')
                      ? path.endsWith('/health')
                      : (stryCov_9fa48('782'),
                        path.startsWith(
                          stryMutAct_9fa48('783') ? '' : (stryCov_9fa48('783'), '/health')
                        ))) ||
                      (stryMutAct_9fa48('784')
                        ? path.endsWith('/webhook')
                        : (stryCov_9fa48('784'),
                          path.startsWith(
                            stryMutAct_9fa48('785') ? '' : (stryCov_9fa48('785'), '/webhook')
                          ))))
          ) {
            if (stryMutAct_9fa48('786')) {
              {
              }
            } else {
              stryCov_9fa48('786');
              return;
            }
          }
          const ipAddress = request.ip;
          await logSecurityEvent(
            stryMutAct_9fa48('787')
              ? {}
              : (stryCov_9fa48('787'),
                {
                  action: stryMutAct_9fa48('788') ? '' : (stryCov_9fa48('788'), 'REQUEST'),
                  entityType: stryMutAct_9fa48('789') ? '' : (stryCov_9fa48('789'), 'api'),
                  details: stryMutAct_9fa48('790')
                    ? {}
                    : (stryCov_9fa48('790'),
                      {
                        method: request.method,
                        path,
                      }),
                  ipAddress,
                })
          );
        }
      }
    );
  }
}
