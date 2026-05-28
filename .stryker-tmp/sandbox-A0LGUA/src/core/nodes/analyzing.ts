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
import { AnalysisService } from '../../services/analysis.service.js';
import { error, info } from '../../utils/logger.js';
import { InterviewState, NodeOutput } from '../types/index.js';
export async function analyzingNode(
  state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  if (stryMutAct_9fa48('1115')) {
    {
    }
  } else {
    stryCov_9fa48('1115');
    if (
      stryMutAct_9fa48('1118')
        ? false
        : stryMutAct_9fa48('1117')
          ? true
          : stryMutAct_9fa48('1116')
            ? state.interviewId
            : (stryCov_9fa48('1116', '1117', '1118'), !state.interviewId)
    ) {
      if (stryMutAct_9fa48('1119')) {
        {
        }
      } else {
        stryCov_9fa48('1119');
        return stryMutAct_9fa48('1120')
          ? {}
          : (stryCov_9fa48('1120'),
            {
              status: stryMutAct_9fa48('1121') ? '' : (stryCov_9fa48('1121'), 'COMPLETED'),
              reportGenerated: stryMutAct_9fa48('1122') ? true : (stryCov_9fa48('1122'), false),
              response: stryMutAct_9fa48('1123')
                ? ''
                : (stryCov_9fa48('1123'), '访谈已结束，非常感谢您拨冗参与！'),
              shouldContinue: stryMutAct_9fa48('1124') ? true : (stryCov_9fa48('1124'), false),
            });
      }
    }
    const interviewId = state.interviewId;
    setImmediate(async () => {
      if (stryMutAct_9fa48('1125')) {
        {
        }
      } else {
        stryCov_9fa48('1125');
        try {
          if (stryMutAct_9fa48('1126')) {
            {
            }
          } else {
            stryCov_9fa48('1126');
            info(
              stryMutAct_9fa48('1127') ? '' : (stryCov_9fa48('1127'), 'Starting async analysis'),
              stryMutAct_9fa48('1128')
                ? {}
                : (stryCov_9fa48('1128'),
                  {
                    interviewId,
                  })
            );
            const analysisService = new AnalysisService();
            const result = await analysisService.analyzeInterview(interviewId);
            info(
              stryMutAct_9fa48('1129') ? '' : (stryCov_9fa48('1129'), 'Async analysis completed'),
              stryMutAct_9fa48('1130')
                ? {}
                : (stryCov_9fa48('1130'),
                  {
                    interviewId,
                    keyFindingsCount: result.report.keyFindings.length,
                  })
            );
          }
        } catch (e) {
          if (stryMutAct_9fa48('1131')) {
            {
            }
          } else {
            stryCov_9fa48('1131');
            error(
              stryMutAct_9fa48('1132') ? '' : (stryCov_9fa48('1132'), 'Async analysis failed'),
              stryMutAct_9fa48('1133')
                ? {}
                : (stryCov_9fa48('1133'),
                  {
                    interviewId,
                    error: e instanceof Error ? e.message : String(e),
                  })
            );
          }
        }
      }
    });
    return stryMutAct_9fa48('1134')
      ? {}
      : (stryCov_9fa48('1134'),
        {
          status: stryMutAct_9fa48('1135') ? '' : (stryCov_9fa48('1135'), 'COMPLETED'),
          reportGenerated: stryMutAct_9fa48('1136') ? false : (stryCov_9fa48('1136'), true),
          response: stryMutAct_9fa48('1137')
            ? ''
            : (stryCov_9fa48('1137'),
              '访谈已完成，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！'),
          shouldContinue: stryMutAct_9fa48('1138') ? true : (stryCov_9fa48('1138'), false),
        });
  }
}
