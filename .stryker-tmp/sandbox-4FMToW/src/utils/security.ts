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
  if (stryMutAct_9fa48('860')) {
    {
    }
  } else {
    stryCov_9fa48('860');
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (
      stryMutAct_9fa48('863')
        ? false
        : stryMutAct_9fa48('862')
          ? true
          : stryMutAct_9fa48('861')
            ? apiKey
            : (stryCov_9fa48('861', '862', '863'), !apiKey)
    ) {
      if (stryMutAct_9fa48('864')) {
        {
        }
      } else {
        stryCov_9fa48('864');
        return reply.status(401).send(
          stryMutAct_9fa48('865')
            ? {}
            : (stryCov_9fa48('865'),
              {
                error: stryMutAct_9fa48('866') ? '' : (stryCov_9fa48('866'), 'API key required'),
              })
        );
      }
    }
    const keyRecord = await prisma.auditLog.findFirst(
      stryMutAct_9fa48('867')
        ? {}
        : (stryCov_9fa48('867'),
          {
            where: stryMutAct_9fa48('868')
              ? {}
              : (stryCov_9fa48('868'),
                {
                  action: stryMutAct_9fa48('869') ? '' : (stryCov_9fa48('869'), 'API_KEY_CREATED'),
                  details: stryMutAct_9fa48('870')
                    ? {}
                    : (stryCov_9fa48('870'),
                      {
                        contains: stryMutAct_9fa48('871')
                          ? apiKey
                          : (stryCov_9fa48('871'), apiKey.substring(0, 8)),
                      }),
                }),
          })
    );
    if (
      stryMutAct_9fa48('874')
        ? false
        : stryMutAct_9fa48('873')
          ? true
          : stryMutAct_9fa48('872')
            ? keyRecord
            : (stryCov_9fa48('872', '873', '874'), !keyRecord)
    ) {
      if (stryMutAct_9fa48('875')) {
        {
        }
      } else {
        stryCov_9fa48('875');
        return reply.status(401).send(
          stryMutAct_9fa48('876')
            ? {}
            : (stryCov_9fa48('876'),
              {
                error: stryMutAct_9fa48('877') ? '' : (stryCov_9fa48('877'), 'Invalid API key'),
              })
        );
      }
    }
    request.user = stryMutAct_9fa48('878')
      ? {}
      : (stryCov_9fa48('878'),
        {
          userId: stryMutAct_9fa48('881')
            ? keyRecord.userId && 'unknown'
            : stryMutAct_9fa48('880')
              ? false
              : stryMutAct_9fa48('879')
                ? true
                : (stryCov_9fa48('879', '880', '881'),
                  keyRecord.userId ||
                    (stryMutAct_9fa48('882') ? '' : (stryCov_9fa48('882'), 'unknown'))),
          role: stryMutAct_9fa48('883') ? '' : (stryCov_9fa48('883'), 'user'),
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
  if (stryMutAct_9fa48('884')) {
    {
    }
  } else {
    stryCov_9fa48('884');
    await prisma.auditLog.create(
      stryMutAct_9fa48('885')
        ? {}
        : (stryCov_9fa48('885'),
          {
            data: stryMutAct_9fa48('886')
              ? {}
              : (stryCov_9fa48('886'),
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
  if (stryMutAct_9fa48('887')) {
    {
    }
  } else {
    stryCov_9fa48('887');
    const patterns = stryMutAct_9fa48('888')
      ? []
      : (stryCov_9fa48('888'),
        [
          stryMutAct_9fa48('889')
            ? {}
            : (stryCov_9fa48('889'),
              {
                regex: stryMutAct_9fa48('892')
                  ? /1[3-9]\D{9}/g
                  : stryMutAct_9fa48('891')
                    ? /1[3-9]\d/g
                    : stryMutAct_9fa48('890')
                      ? /1[^3-9]\d{9}/g
                      : (stryCov_9fa48('890', '891', '892'), /1[3-9]\d{9}/g),
                replacement: stryMutAct_9fa48('893') ? '' : (stryCov_9fa48('893'), '1XXXXXXXXXX'),
              }),
          stryMutAct_9fa48('894')
            ? {}
            : (stryCov_9fa48('894'),
              {
                regex: stryMutAct_9fa48('900')
                  ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[^A-Z|a-z]{2,}\b/g
                  : stryMutAct_9fa48('899')
                    ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]\b/g
                    : stryMutAct_9fa48('898')
                      ? /\b[A-Za-z0-9._%+-]+@[^A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                      : stryMutAct_9fa48('897')
                        ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]\.[A-Z|a-z]{2,}\b/g
                        : stryMutAct_9fa48('896')
                          ? /\b[^A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                          : stryMutAct_9fa48('895')
                            ? /\b[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                            : (stryCov_9fa48('895', '896', '897', '898', '899', '900'),
                              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
                replacement: stryMutAct_9fa48('901') ? '' : (stryCov_9fa48('901'), 'xxx@xxx.xxx'),
              }),
          stryMutAct_9fa48('902')
            ? {}
            : (stryCov_9fa48('902'),
              {
                regex: stryMutAct_9fa48('906')
                  ? /\b\d{17}[\DXx]\b/g
                  : stryMutAct_9fa48('905')
                    ? /\b\d{17}[^\dXx]\b/g
                    : stryMutAct_9fa48('904')
                      ? /\b\D{17}[\dXx]\b/g
                      : stryMutAct_9fa48('903')
                        ? /\b\d[\dXx]\b/g
                        : (stryCov_9fa48('903', '904', '905', '906'), /\b\d{17}[\dXx]\b/g),
                replacement: stryMutAct_9fa48('907')
                  ? ''
                  : (stryCov_9fa48('907'), 'XXXXXXXXXXXXXXXXX'),
              }),
        ]);
    let result = data;
    for (const { regex, replacement } of patterns) {
      if (stryMutAct_9fa48('908')) {
        {
        }
      } else {
        stryCov_9fa48('908');
        result = result.replace(regex, replacement);
      }
    }
    return result;
  }
}
export function generateApiKey(): string {
  if (stryMutAct_9fa48('909')) {
    {
    }
  } else {
    stryCov_9fa48('909');
    return stryMutAct_9fa48('910')
      ? ``
      : (stryCov_9fa48('910'),
        `ib_${crypto.randomBytes(32).toString(stryMutAct_9fa48('911') ? '' : (stryCov_9fa48('911'), 'hex'))}`);
  }
}
export async function securityMiddleware(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('912')) {
    {
    }
  } else {
    stryCov_9fa48('912');
    fastify.addHook(
      stryMutAct_9fa48('913') ? '' : (stryCov_9fa48('913'), 'onRequest'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('914')) {
          {
          }
        } else {
          stryCov_9fa48('914');
          const path = request.url;
          if (
            stryMutAct_9fa48('917')
              ? path.startsWith('/health') && path.startsWith('/webhook')
              : stryMutAct_9fa48('916')
                ? false
                : stryMutAct_9fa48('915')
                  ? true
                  : (stryCov_9fa48('915', '916', '917'),
                    (stryMutAct_9fa48('918')
                      ? path.endsWith('/health')
                      : (stryCov_9fa48('918'),
                        path.startsWith(
                          stryMutAct_9fa48('919') ? '' : (stryCov_9fa48('919'), '/health')
                        ))) ||
                      (stryMutAct_9fa48('920')
                        ? path.endsWith('/webhook')
                        : (stryCov_9fa48('920'),
                          path.startsWith(
                            stryMutAct_9fa48('921') ? '' : (stryCov_9fa48('921'), '/webhook')
                          ))))
          ) {
            if (stryMutAct_9fa48('922')) {
              {
              }
            } else {
              stryCov_9fa48('922');
              return;
            }
          }
          const ipAddress = request.ip;
          await logSecurityEvent(
            stryMutAct_9fa48('923')
              ? {}
              : (stryCov_9fa48('923'),
                {
                  action: stryMutAct_9fa48('924') ? '' : (stryCov_9fa48('924'), 'REQUEST'),
                  entityType: stryMutAct_9fa48('925') ? '' : (stryCov_9fa48('925'), 'api'),
                  details: stryMutAct_9fa48('926')
                    ? {}
                    : (stryCov_9fa48('926'),
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
