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
  if (stryMutAct_9fa48('1014')) {
    {
    }
  } else {
    stryCov_9fa48('1014');
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (
      stryMutAct_9fa48('1017')
        ? false
        : stryMutAct_9fa48('1016')
          ? true
          : stryMutAct_9fa48('1015')
            ? apiKey
            : (stryCov_9fa48('1015', '1016', '1017'), !apiKey)
    ) {
      if (stryMutAct_9fa48('1018')) {
        {
        }
      } else {
        stryCov_9fa48('1018');
        return reply.status(401).send(
          stryMutAct_9fa48('1019')
            ? {}
            : (stryCov_9fa48('1019'),
              {
                error: stryMutAct_9fa48('1020') ? '' : (stryCov_9fa48('1020'), 'API key required'),
              })
        );
      }
    }
    const keyRecord = await prisma.auditLog.findFirst(
      stryMutAct_9fa48('1021')
        ? {}
        : (stryCov_9fa48('1021'),
          {
            where: stryMutAct_9fa48('1022')
              ? {}
              : (stryCov_9fa48('1022'),
                {
                  action: stryMutAct_9fa48('1023')
                    ? ''
                    : (stryCov_9fa48('1023'), 'API_KEY_CREATED'),
                  details: stryMutAct_9fa48('1024')
                    ? {}
                    : (stryCov_9fa48('1024'),
                      {
                        contains: stryMutAct_9fa48('1025')
                          ? apiKey
                          : (stryCov_9fa48('1025'), apiKey.substring(0, 8)),
                      }),
                }),
          })
    );
    if (
      stryMutAct_9fa48('1028')
        ? false
        : stryMutAct_9fa48('1027')
          ? true
          : stryMutAct_9fa48('1026')
            ? keyRecord
            : (stryCov_9fa48('1026', '1027', '1028'), !keyRecord)
    ) {
      if (stryMutAct_9fa48('1029')) {
        {
        }
      } else {
        stryCov_9fa48('1029');
        return reply.status(401).send(
          stryMutAct_9fa48('1030')
            ? {}
            : (stryCov_9fa48('1030'),
              {
                error: stryMutAct_9fa48('1031') ? '' : (stryCov_9fa48('1031'), 'Invalid API key'),
              })
        );
      }
    }
    request.user = stryMutAct_9fa48('1032')
      ? {}
      : (stryCov_9fa48('1032'),
        {
          userId: stryMutAct_9fa48('1035')
            ? keyRecord.userId && 'unknown'
            : stryMutAct_9fa48('1034')
              ? false
              : stryMutAct_9fa48('1033')
                ? true
                : (stryCov_9fa48('1033', '1034', '1035'),
                  keyRecord.userId ||
                    (stryMutAct_9fa48('1036') ? '' : (stryCov_9fa48('1036'), 'unknown'))),
          role: stryMutAct_9fa48('1037') ? '' : (stryCov_9fa48('1037'), 'user'),
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
  if (stryMutAct_9fa48('1038')) {
    {
    }
  } else {
    stryCov_9fa48('1038');
    await prisma.auditLog.create(
      stryMutAct_9fa48('1039')
        ? {}
        : (stryCov_9fa48('1039'),
          {
            data: stryMutAct_9fa48('1040')
              ? {}
              : (stryCov_9fa48('1040'),
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
  if (stryMutAct_9fa48('1041')) {
    {
    }
  } else {
    stryCov_9fa48('1041');
    const patterns = stryMutAct_9fa48('1042')
      ? []
      : (stryCov_9fa48('1042'),
        [
          stryMutAct_9fa48('1043')
            ? {}
            : (stryCov_9fa48('1043'),
              {
                regex: stryMutAct_9fa48('1046')
                  ? /1[3-9]\D{9}/g
                  : stryMutAct_9fa48('1045')
                    ? /1[3-9]\d/g
                    : stryMutAct_9fa48('1044')
                      ? /1[^3-9]\d{9}/g
                      : (stryCov_9fa48('1044', '1045', '1046'), /1[3-9]\d{9}/g),
                replacement: stryMutAct_9fa48('1047') ? '' : (stryCov_9fa48('1047'), '1XXXXXXXXXX'),
              }),
          stryMutAct_9fa48('1048')
            ? {}
            : (stryCov_9fa48('1048'),
              {
                regex: stryMutAct_9fa48('1054')
                  ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[^A-Z|a-z]{2,}\b/g
                  : stryMutAct_9fa48('1053')
                    ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]\b/g
                    : stryMutAct_9fa48('1052')
                      ? /\b[A-Za-z0-9._%+-]+@[^A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                      : stryMutAct_9fa48('1051')
                        ? /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]\.[A-Z|a-z]{2,}\b/g
                        : stryMutAct_9fa48('1050')
                          ? /\b[^A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                          : stryMutAct_9fa48('1049')
                            ? /\b[A-Za-z0-9._%+-]@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
                            : (stryCov_9fa48('1049', '1050', '1051', '1052', '1053', '1054'),
                              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g),
                replacement: stryMutAct_9fa48('1055') ? '' : (stryCov_9fa48('1055'), 'xxx@xxx.xxx'),
              }),
          stryMutAct_9fa48('1056')
            ? {}
            : (stryCov_9fa48('1056'),
              {
                regex: stryMutAct_9fa48('1060')
                  ? /\b\d{17}[\DXx]\b/g
                  : stryMutAct_9fa48('1059')
                    ? /\b\d{17}[^\dXx]\b/g
                    : stryMutAct_9fa48('1058')
                      ? /\b\D{17}[\dXx]\b/g
                      : stryMutAct_9fa48('1057')
                        ? /\b\d[\dXx]\b/g
                        : (stryCov_9fa48('1057', '1058', '1059', '1060'), /\b\d{17}[\dXx]\b/g),
                replacement: stryMutAct_9fa48('1061')
                  ? ''
                  : (stryCov_9fa48('1061'), 'XXXXXXXXXXXXXXXXX'),
              }),
        ]);
    let result = data;
    for (const { regex, replacement } of patterns) {
      if (stryMutAct_9fa48('1062')) {
        {
        }
      } else {
        stryCov_9fa48('1062');
        result = result.replace(regex, replacement);
      }
    }
    return result;
  }
}
export function generateApiKey(): string {
  if (stryMutAct_9fa48('1063')) {
    {
    }
  } else {
    stryCov_9fa48('1063');
    return stryMutAct_9fa48('1064')
      ? ``
      : (stryCov_9fa48('1064'),
        `ib_${crypto.randomBytes(32).toString(stryMutAct_9fa48('1065') ? '' : (stryCov_9fa48('1065'), 'hex'))}`);
  }
}
export async function securityMiddleware(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('1066')) {
    {
    }
  } else {
    stryCov_9fa48('1066');
    fastify.addHook(
      stryMutAct_9fa48('1067') ? '' : (stryCov_9fa48('1067'), 'onRequest'),
      async (request, _reply) => {
        if (stryMutAct_9fa48('1068')) {
          {
          }
        } else {
          stryCov_9fa48('1068');
          const path = request.url;
          if (
            stryMutAct_9fa48('1071')
              ? path.startsWith('/health') && path.startsWith('/webhook')
              : stryMutAct_9fa48('1070')
                ? false
                : stryMutAct_9fa48('1069')
                  ? true
                  : (stryCov_9fa48('1069', '1070', '1071'),
                    (stryMutAct_9fa48('1072')
                      ? path.endsWith('/health')
                      : (stryCov_9fa48('1072'),
                        path.startsWith(
                          stryMutAct_9fa48('1073') ? '' : (stryCov_9fa48('1073'), '/health')
                        ))) ||
                      (stryMutAct_9fa48('1074')
                        ? path.endsWith('/webhook')
                        : (stryCov_9fa48('1074'),
                          path.startsWith(
                            stryMutAct_9fa48('1075') ? '' : (stryCov_9fa48('1075'), '/webhook')
                          ))))
          ) {
            if (stryMutAct_9fa48('1076')) {
              {
              }
            } else {
              stryCov_9fa48('1076');
              return;
            }
          }
          const ipAddress = request.ip;
          await logSecurityEvent(
            stryMutAct_9fa48('1077')
              ? {}
              : (stryCov_9fa48('1077'),
                {
                  action: stryMutAct_9fa48('1078') ? '' : (stryCov_9fa48('1078'), 'REQUEST'),
                  entityType: stryMutAct_9fa48('1079') ? '' : (stryCov_9fa48('1079'), 'api'),
                  details: stryMutAct_9fa48('1080')
                    ? {}
                    : (stryCov_9fa48('1080'),
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
