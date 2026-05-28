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
  if (stryMutAct_9fa48('4135')) {
    {
    }
  } else {
    stryCov_9fa48('4135');
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (
      stryMutAct_9fa48('4138')
        ? false
        : stryMutAct_9fa48('4137')
          ? true
          : stryMutAct_9fa48('4136')
            ? apiKey
            : (stryCov_9fa48('4136', '4137', '4138'), !apiKey)
    ) {
      if (stryMutAct_9fa48('4139')) {
        {
        }
      } else {
        stryCov_9fa48('4139');
        return reply.status(401).send(
          stryMutAct_9fa48('4140')
            ? {}
            : (stryCov_9fa48('4140'),
              {
                error: stryMutAct_9fa48('4141') ? '' : (stryCov_9fa48('4141'), 'API key required'),
              })
        );
      }
    }
    const keyRecord = await prisma.auditLog.findFirst(
      stryMutAct_9fa48('4142')
        ? {}
        : (stryCov_9fa48('4142'),
          {
            where: stryMutAct_9fa48('4143')
              ? {}
              : (stryCov_9fa48('4143'),
                {
                  action: stryMutAct_9fa48('4144')
                    ? ''
                    : (stryCov_9fa48('4144'), 'API_KEY_CREATED'),
                  details: stryMutAct_9fa48('4145')
                    ? {}
                    : (stryCov_9fa48('4145'),
                      {
                        contains: stryMutAct_9fa48('4146')
                          ? apiKey
                          : (stryCov_9fa48('4146'), apiKey.substring(0, 8)),
                      }),
                }),
          })
    );
    if (
      stryMutAct_9fa48('4149')
        ? false
        : stryMutAct_9fa48('4148')
          ? true
          : stryMutAct_9fa48('4147')
            ? keyRecord
            : (stryCov_9fa48('4147', '4148', '4149'), !keyRecord)
    ) {
      if (stryMutAct_9fa48('4150')) {
        {
        }
      } else {
        stryCov_9fa48('4150');
        return reply.status(401).send(
          stryMutAct_9fa48('4151')
            ? {}
            : (stryCov_9fa48('4151'),
              {
                error: stryMutAct_9fa48('4152') ? '' : (stryCov_9fa48('4152'), 'Invalid API key'),
              })
        );
      }
    }
    request.user = stryMutAct_9fa48('4153')
      ? {}
      : (stryCov_9fa48('4153'),
        {
          userId: stryMutAct_9fa48('4156')
            ? keyRecord.userId && 'unknown'
            : stryMutAct_9fa48('4155')
              ? false
              : stryMutAct_9fa48('4154')
                ? true
                : (stryCov_9fa48('4154', '4155', '4156'),
                  keyRecord.userId ||
                    (stryMutAct_9fa48('4157') ? '' : (stryCov_9fa48('4157'), 'unknown'))),
          role: stryMutAct_9fa48('4158') ? '' : (stryCov_9fa48('4158'), 'user'),
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
  if (stryMutAct_9fa48('4159')) {
    {
    }
  } else {
    stryCov_9fa48('4159');
    await prisma.auditLog.create(
      stryMutAct_9fa48('4160')
        ? {}
        : (stryCov_9fa48('4160'),
          {
            data: stryMutAct_9fa48('4161')
              ? {}
              : (stryCov_9fa48('4161'),
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
  if (stryMutAct_9fa48('4162')) {
    {
    }
  } else {
    stryCov_9fa48('4162');
    const patterns = stryMutAct_9fa48('4163')
      ? []
      : (stryCov_9fa48('4163'),
        [
          stryMutAct_9fa48('4164')
            ? {}
            : (stryCov_9fa48('4164'),
              {
                regex: stryMutAct_9fa48('4167')
                  ? /1[3-9]\D{9}/g
                  : stryMutAct_9fa48('4166')
                    ? /1[3-9]\d/g
                    : stryMutAct_9fa48('4165')
                      ? /1[^3-9]\d{9}/g
                      : (stryCov_9fa48('4165', '4166', '4167'), /1[3-9]\d{9}/g),
                replacement: stryMutAct_9fa48('4168') ? '' : (stryCov_9fa48('4168'), '1XXXXXXXXXX'),
              }),
          stryMutAct_9fa48('4169')
            ? {}
            : (stryCov_9fa48('4169'),
              {
                regex: stryMutAct_9fa48('4175')
                  ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[^A-Z|a-z]{2,}\b/g
                  : stryMutAct_9fa48('4174')
                    ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]\b/g
                    : stryMutAct_9fa48('4173')
                      ? /\b[A-Za-z0-9._%+-]+@[^A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                      : stryMutAct_9fa48('4172')
                        ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]\.[A-Z|a-z]{2,}\b/g
                        : stryMutAct_9fa48('4171')
                          ? /\b[^A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                          : stryMutAct_9fa48('4170')
                            ? /\b[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                            : (stryCov_9fa48('4170', '4171', '4172', '4173', '4174', '4175'),
                              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
                replacement: stryMutAct_9fa48('4176') ? '' : (stryCov_9fa48('4176'), 'xxx@xxx.xxx'),
              }),
          stryMutAct_9fa48('4177')
            ? {}
            : (stryCov_9fa48('4177'),
              {
                regex: stryMutAct_9fa48('4181')
                  ? /\b\d{17}[\DXx]\b/g
                  : stryMutAct_9fa48('4180')
                    ? /\b\d{17}[^\dXx]\b/g
                    : stryMutAct_9fa48('4179')
                      ? /\b\D{17}[\dXx]\b/g
                      : stryMutAct_9fa48('4178')
                        ? /\b\d[\dXx]\b/g
                        : (stryCov_9fa48('4178', '4179', '4180', '4181'), /\b\d{17}[\dXx]\b/g),
                replacement: stryMutAct_9fa48('4182')
                  ? ''
                  : (stryCov_9fa48('4182'), 'XXXXXXXXXXXXXXXXX'),
              }),
        ]);
    let result = data;
    for (const { regex, replacement } of patterns) {
      if (stryMutAct_9fa48('4183')) {
        {
        }
      } else {
        stryCov_9fa48('4183');
        result = result.replace(regex, replacement);
      }
    }
    return result;
  }
}
export function generateApiKey(): string {
  if (stryMutAct_9fa48('4184')) {
    {
    }
  } else {
    stryCov_9fa48('4184');
    return stryMutAct_9fa48('4185')
      ? ``
      : (stryCov_9fa48('4185'),
        `ib_${crypto.randomBytes(32).toString(stryMutAct_9fa48('4186') ? '' : (stryCov_9fa48('4186'), 'hex'))}`);
  }
}
export async function securityMiddleware(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('4187')) {
    {
    }
  } else {
    stryCov_9fa48('4187');
    fastify.addHook(
      stryMutAct_9fa48('4188') ? '' : (stryCov_9fa48('4188'), 'onRequest'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('4189')) {
          {
          }
        } else {
          stryCov_9fa48('4189');
          const path = request.url;
          if (
            stryMutAct_9fa48('4192')
              ? path.startsWith('/health') && path.startsWith('/webhook')
              : stryMutAct_9fa48('4191')
                ? false
                : stryMutAct_9fa48('4190')
                  ? true
                  : (stryCov_9fa48('4190', '4191', '4192'),
                    (stryMutAct_9fa48('4193')
                      ? path.endsWith('/health')
                      : (stryCov_9fa48('4193'),
                        path.startsWith(
                          stryMutAct_9fa48('4194') ? '' : (stryCov_9fa48('4194'), '/health')
                        ))) ||
                      (stryMutAct_9fa48('4195')
                        ? path.endsWith('/webhook')
                        : (stryCov_9fa48('4195'),
                          path.startsWith(
                            stryMutAct_9fa48('4196') ? '' : (stryCov_9fa48('4196'), '/webhook')
                          ))))
          ) {
            if (stryMutAct_9fa48('4197')) {
              {
              }
            } else {
              stryCov_9fa48('4197');
              return;
            }
          }
          const ipAddress = request.ip;
          await logSecurityEvent(
            stryMutAct_9fa48('4198')
              ? {}
              : (stryCov_9fa48('4198'),
                {
                  action: stryMutAct_9fa48('4199') ? '' : (stryCov_9fa48('4199'), 'REQUEST'),
                  entityType: stryMutAct_9fa48('4200') ? '' : (stryCov_9fa48('4200'), 'api'),
                  details: stryMutAct_9fa48('4201')
                    ? {}
                    : (stryCov_9fa48('4201'),
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
