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
import { info } from '../utils/logger.js';
const prisma = new PrismaClient();
export async function recordAnalysisFailure(
  interviewId: string,
  errorType: string,
  errorMessage: string
): Promise<void> {
  if (stryMutAct_9fa48('2826')) {
    {
    }
  } else {
    stryCov_9fa48('2826');
    try {
      if (stryMutAct_9fa48('2827')) {
        {
        }
      } else {
        stryCov_9fa48('2827');
        await prisma.analysisFailure.upsert(
          stryMutAct_9fa48('2828')
            ? {}
            : (stryCov_9fa48('2828'),
              {
                where: stryMutAct_9fa48('2829')
                  ? {}
                  : (stryCov_9fa48('2829'),
                    {
                      interviewId_errorType: stryMutAct_9fa48('2830')
                        ? {}
                        : (stryCov_9fa48('2830'),
                          {
                            interviewId,
                            errorType,
                          }),
                    }),
                create: stryMutAct_9fa48('2831')
                  ? {}
                  : (stryCov_9fa48('2831'),
                    {
                      interviewId,
                      errorType,
                      errorMessage,
                      retried: stryMutAct_9fa48('2832') ? true : (stryCov_9fa48('2832'), false),
                      retryCount: 0,
                    }),
                update: {},
              })
        );
        info(
          stryMutAct_9fa48('2833') ? '' : (stryCov_9fa48('2833'), 'Analysis failure recorded'),
          stryMutAct_9fa48('2834')
            ? {}
            : (stryCov_9fa48('2834'),
              {
                interviewId,
                errorType,
              })
        );
      }
    } finally {
      if (stryMutAct_9fa48('2835')) {
        {
        }
      } else {
        stryCov_9fa48('2835');
        await prisma.$disconnect();
      }
    }
  }
}
export async function getFailedAnalyses() {
  if (stryMutAct_9fa48('2836')) {
    {
    }
  } else {
    stryCov_9fa48('2836');
    try {
      if (stryMutAct_9fa48('2837')) {
        {
        }
      } else {
        stryCov_9fa48('2837');
        return prisma.analysisFailure.findMany(
          stryMutAct_9fa48('2838')
            ? {}
            : (stryCov_9fa48('2838'),
              {
                where: stryMutAct_9fa48('2839')
                  ? {}
                  : (stryCov_9fa48('2839'),
                    {
                      retried: stryMutAct_9fa48('2840') ? true : (stryCov_9fa48('2840'), false),
                    }),
                orderBy: stryMutAct_9fa48('2841')
                  ? {}
                  : (stryCov_9fa48('2841'),
                    {
                      createdAt: stryMutAct_9fa48('2842') ? '' : (stryCov_9fa48('2842'), 'asc'),
                    }),
              })
        );
      }
    } finally {
      if (stryMutAct_9fa48('2843')) {
        {
        }
      } else {
        stryCov_9fa48('2843');
        await prisma.$disconnect();
      }
    }
  }
}
