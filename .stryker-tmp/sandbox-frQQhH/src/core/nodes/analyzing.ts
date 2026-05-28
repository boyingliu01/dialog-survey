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
  if (stryMutAct_9fa48('0')) {
    {
    }
  } else {
    stryCov_9fa48('0');
    if (
      stryMutAct_9fa48('3')
        ? false
        : stryMutAct_9fa48('2')
          ? true
          : stryMutAct_9fa48('1')
            ? state.interviewId
            : (stryCov_9fa48('1', '2', '3'), !state.interviewId)
    ) {
      if (stryMutAct_9fa48('4')) {
        {
        }
      } else {
        stryCov_9fa48('4');
        return stryMutAct_9fa48('5')
          ? {}
          : (stryCov_9fa48('5'),
            {
              status: stryMutAct_9fa48('6') ? '' : (stryCov_9fa48('6'), 'COMPLETED'),
              reportGenerated: stryMutAct_9fa48('7') ? true : (stryCov_9fa48('7'), false),
              response: stryMutAct_9fa48('8')
                ? ''
                : (stryCov_9fa48('8'), '访谈已结束，非常感谢您拨冗参与！'),
              shouldContinue: stryMutAct_9fa48('9') ? true : (stryCov_9fa48('9'), false),
            });
      }
    }
    const interviewId = state.interviewId;
    setImmediate(async () => {
      if (stryMutAct_9fa48('10')) {
        {
        }
      } else {
        stryCov_9fa48('10');
        try {
          if (stryMutAct_9fa48('11')) {
            {
            }
          } else {
            stryCov_9fa48('11');
            info(
              stryMutAct_9fa48('12') ? '' : (stryCov_9fa48('12'), 'Starting async analysis'),
              stryMutAct_9fa48('13')
                ? {}
                : (stryCov_9fa48('13'),
                  {
                    interviewId,
                  })
            );
            const analysisService = new AnalysisService();
            const result = await analysisService.analyzeInterview(interviewId);
            info(
              stryMutAct_9fa48('14') ? '' : (stryCov_9fa48('14'), 'Async analysis completed'),
              stryMutAct_9fa48('15')
                ? {}
                : (stryCov_9fa48('15'),
                  {
                    interviewId,
                    keyFindingsCount: result.report.keyFindings.length,
                  })
            );
          }
        } catch (e) {
          if (stryMutAct_9fa48('16')) {
            {
            }
          } else {
            stryCov_9fa48('16');
            error(
              stryMutAct_9fa48('17') ? '' : (stryCov_9fa48('17'), 'Async analysis failed'),
              stryMutAct_9fa48('18')
                ? {}
                : (stryCov_9fa48('18'),
                  {
                    interviewId,
                    error: e instanceof Error ? e.message : String(e),
                  })
            );
          }
        }
      }
    });
    return stryMutAct_9fa48('19')
      ? {}
      : (stryCov_9fa48('19'),
        {
          status: stryMutAct_9fa48('20') ? '' : (stryCov_9fa48('20'), 'COMPLETED'),
          reportGenerated: stryMutAct_9fa48('21') ? false : (stryCov_9fa48('21'), true),
          response: stryMutAct_9fa48('22')
            ? ''
            : (stryCov_9fa48('22'),
              '访谈已完成，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！'),
          shouldContinue: stryMutAct_9fa48('23') ? true : (stryCov_9fa48('23'), false),
        });
  }
}
