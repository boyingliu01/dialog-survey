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
  if (stryMutAct_9fa48('457')) {
    {
    }
  } else {
    stryCov_9fa48('457');
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (
      stryMutAct_9fa48('460')
        ? false
        : stryMutAct_9fa48('459')
          ? true
          : stryMutAct_9fa48('458')
            ? apiKey
            : (stryCov_9fa48('458', '459', '460'), !apiKey)
    ) {
      if (stryMutAct_9fa48('461')) {
        {
        }
      } else {
        stryCov_9fa48('461');
        return reply.status(401).send(
          stryMutAct_9fa48('462')
            ? {}
            : (stryCov_9fa48('462'),
              {
                error: stryMutAct_9fa48('463') ? '' : (stryCov_9fa48('463'), 'API key required'),
              })
        );
      }
    }
    const keyRecord = await prisma.auditLog.findFirst(
      stryMutAct_9fa48('464')
        ? {}
        : (stryCov_9fa48('464'),
          {
            where: stryMutAct_9fa48('465')
              ? {}
              : (stryCov_9fa48('465'),
                {
                  action: stryMutAct_9fa48('466') ? '' : (stryCov_9fa48('466'), 'API_KEY_CREATED'),
                  details: stryMutAct_9fa48('467')
                    ? {}
                    : (stryCov_9fa48('467'),
                      {
                        contains: stryMutAct_9fa48('468')
                          ? apiKey
                          : (stryCov_9fa48('468'), apiKey.substring(0, 8)),
                      }),
                }),
          })
    );
    if (
      stryMutAct_9fa48('471')
        ? false
        : stryMutAct_9fa48('470')
          ? true
          : stryMutAct_9fa48('469')
            ? keyRecord
            : (stryCov_9fa48('469', '470', '471'), !keyRecord)
    ) {
      if (stryMutAct_9fa48('472')) {
        {
        }
      } else {
        stryCov_9fa48('472');
        return reply.status(401).send(
          stryMutAct_9fa48('473')
            ? {}
            : (stryCov_9fa48('473'),
              {
                error: stryMutAct_9fa48('474') ? '' : (stryCov_9fa48('474'), 'Invalid API key'),
              })
        );
      }
    }
    request.user = stryMutAct_9fa48('475')
      ? {}
      : (stryCov_9fa48('475'),
        {
          userId: stryMutAct_9fa48('478')
            ? keyRecord.userId && 'unknown'
            : stryMutAct_9fa48('477')
              ? false
              : stryMutAct_9fa48('476')
                ? true
                : (stryCov_9fa48('476', '477', '478'),
                  keyRecord.userId ||
                    (stryMutAct_9fa48('479') ? '' : (stryCov_9fa48('479'), 'unknown'))),
          role: stryMutAct_9fa48('480') ? '' : (stryCov_9fa48('480'), 'user'),
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
  if (stryMutAct_9fa48('481')) {
    {
    }
  } else {
    stryCov_9fa48('481');
    await prisma.auditLog.create(
      stryMutAct_9fa48('482')
        ? {}
        : (stryCov_9fa48('482'),
          {
            data: stryMutAct_9fa48('483')
              ? {}
              : (stryCov_9fa48('483'),
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
  if (stryMutAct_9fa48('484')) {
    {
    }
  } else {
    stryCov_9fa48('484');
    const patterns = stryMutAct_9fa48('485')
      ? []
      : (stryCov_9fa48('485'),
        [
          stryMutAct_9fa48('486')
            ? {}
            : (stryCov_9fa48('486'),
              {
                regex: stryMutAct_9fa48('489')
                  ? /1[3-9]\D{9}/g
                  : stryMutAct_9fa48('488')
                    ? /1[3-9]\d/g
                    : stryMutAct_9fa48('487')
                      ? /1[^3-9]\d{9}/g
                      : (stryCov_9fa48('487', '488', '489'), /1[3-9]\d{9}/g),
                replacement: stryMutAct_9fa48('490') ? '' : (stryCov_9fa48('490'), '1XXXXXXXXXX'),
              }),
          stryMutAct_9fa48('491')
            ? {}
            : (stryCov_9fa48('491'),
              {
                regex: stryMutAct_9fa48('497')
                  ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[^A-Z|a-z]{2,}\b/g
                  : stryMutAct_9fa48('496')
                    ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]\b/g
                    : stryMutAct_9fa48('495')
                      ? /\b[A-Za-z0-9._%+-]+@[^A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                      : stryMutAct_9fa48('494')
                        ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]\.[A-Z|a-z]{2,}\b/g
                        : stryMutAct_9fa48('493')
                          ? /\b[^A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                          : stryMutAct_9fa48('492')
                            ? /\b[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                            : (stryCov_9fa48('492', '493', '494', '495', '496', '497'),
                              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
                replacement: stryMutAct_9fa48('498') ? '' : (stryCov_9fa48('498'), 'xxx@xxx.xxx'),
              }),
          stryMutAct_9fa48('499')
            ? {}
            : (stryCov_9fa48('499'),
              {
                regex: stryMutAct_9fa48('503')
                  ? /\b\d{17}[\DXx]\b/g
                  : stryMutAct_9fa48('502')
                    ? /\b\d{17}[^\dXx]\b/g
                    : stryMutAct_9fa48('501')
                      ? /\b\D{17}[\dXx]\b/g
                      : stryMutAct_9fa48('500')
                        ? /\b\d[\dXx]\b/g
                        : (stryCov_9fa48('500', '501', '502', '503'), /\b\d{17}[\dXx]\b/g),
                replacement: stryMutAct_9fa48('504')
                  ? ''
                  : (stryCov_9fa48('504'), 'XXXXXXXXXXXXXXXXX'),
              }),
        ]);
    let result = data;
    for (const { regex, replacement } of patterns) {
      if (stryMutAct_9fa48('505')) {
        {
        }
      } else {
        stryCov_9fa48('505');
        result = result.replace(regex, replacement);
      }
    }
    return result;
  }
}
export function generateApiKey(): string {
  if (stryMutAct_9fa48('506')) {
    {
    }
  } else {
    stryCov_9fa48('506');
    return stryMutAct_9fa48('507')
      ? ``
      : (stryCov_9fa48('507'),
        `ib_${crypto.randomBytes(32).toString(stryMutAct_9fa48('508') ? '' : (stryCov_9fa48('508'), 'hex'))}`);
  }
}
export async function securityMiddleware(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('509')) {
    {
    }
  } else {
    stryCov_9fa48('509');
    fastify.addHook(
      stryMutAct_9fa48('510') ? '' : (stryCov_9fa48('510'), 'onRequest'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('511')) {
          {
          }
        } else {
          stryCov_9fa48('511');
          const path = request.url;
          if (
            stryMutAct_9fa48('514')
              ? path.startsWith('/health') && path.startsWith('/webhook')
              : stryMutAct_9fa48('513')
                ? false
                : stryMutAct_9fa48('512')
                  ? true
                  : (stryCov_9fa48('512', '513', '514'),
                    (stryMutAct_9fa48('515')
                      ? path.endsWith('/health')
                      : (stryCov_9fa48('515'),
                        path.startsWith(
                          stryMutAct_9fa48('516') ? '' : (stryCov_9fa48('516'), '/health')
                        ))) ||
                      (stryMutAct_9fa48('517')
                        ? path.endsWith('/webhook')
                        : (stryCov_9fa48('517'),
                          path.startsWith(
                            stryMutAct_9fa48('518') ? '' : (stryCov_9fa48('518'), '/webhook')
                          ))))
          ) {
            if (stryMutAct_9fa48('519')) {
              {
              }
            } else {
              stryCov_9fa48('519');
              return;
            }
          }
          const ipAddress = request.ip;
          await logSecurityEvent(
            stryMutAct_9fa48('520')
              ? {}
              : (stryCov_9fa48('520'),
                {
                  action: stryMutAct_9fa48('521') ? '' : (stryCov_9fa48('521'), 'REQUEST'),
                  entityType: stryMutAct_9fa48('522') ? '' : (stryCov_9fa48('522'), 'api'),
                  details: stryMutAct_9fa48('523')
                    ? {}
                    : (stryCov_9fa48('523'),
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
