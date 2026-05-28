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
import { analyzingNode } from './nodes/analyzing.js';
import { completedNode } from './nodes/completed.js';
import { interviewingNode } from './nodes/interviewing.js';
import { planningNode } from './nodes/planning.js';
import type { InterviewState, NodeInput, NodeOutput } from './types/index.js';
export interface GraphResult {
  response: string;
  nextState: InterviewState;
}
export async function runInterviewGraph(
  initialState: InterviewState,
  input: NodeInput
): Promise<GraphResult> {
  if (stryMutAct_9fa48('1087')) {
    {
    }
  } else {
    stryCov_9fa48('1087');
    let state: InterviewState = stryMutAct_9fa48('1088')
      ? {}
      : (stryCov_9fa48('1088'),
        {
          ...initialState,
        });
    let output: NodeOutput = {};
    if (
      stryMutAct_9fa48('1091')
        ? state.status !== 'PENDING'
        : stryMutAct_9fa48('1090')
          ? false
          : stryMutAct_9fa48('1089')
            ? true
            : (stryCov_9fa48('1089', '1090', '1091'),
              state.status === (stryMutAct_9fa48('1092') ? '' : (stryCov_9fa48('1092'), 'PENDING')))
    ) {
      if (stryMutAct_9fa48('1093')) {
        {
        }
      } else {
        stryCov_9fa48('1093');
        const result = await planningNode(state);
        state = {
          ...state,
          ...result,
        } as InterviewState;
        output = stryMutAct_9fa48('1094')
          ? {}
          : (stryCov_9fa48('1094'),
            {
              ...output,
              ...result,
            });
      }
    }
    if (
      stryMutAct_9fa48('1096')
        ? false
        : stryMutAct_9fa48('1095')
          ? true
          : (stryCov_9fa48('1095', '1096'), input.content)
    ) {
      if (stryMutAct_9fa48('1097')) {
        {
        }
      } else {
        stryCov_9fa48('1097');
        const result = await interviewingNode(
          state,
          stryMutAct_9fa48('1098')
            ? {}
            : (stryCov_9fa48('1098'),
              {
                content: input.content,
              })
        );
        state = {
          ...state,
          ...result,
        } as InterviewState;
        output = stryMutAct_9fa48('1099')
          ? {}
          : (stryCov_9fa48('1099'),
            {
              ...output,
              ...result,
            });
      }
    }
    if (
      stryMutAct_9fa48('1102')
        ? false
        : stryMutAct_9fa48('1101')
          ? true
          : stryMutAct_9fa48('1100')
            ? output.shouldContinue
            : (stryCov_9fa48('1100', '1101', '1102'), !output.shouldContinue)
    ) {
      if (stryMutAct_9fa48('1103')) {
        {
        }
      } else {
        stryCov_9fa48('1103');
        const result = await analyzingNode(state);
        state = {
          ...state,
          ...result,
        } as InterviewState;
        output = stryMutAct_9fa48('1104')
          ? {}
          : (stryCov_9fa48('1104'),
            {
              ...output,
              ...result,
            });
        if (
          stryMutAct_9fa48('1107')
            ? state.status !== 'COMPLETED'
            : stryMutAct_9fa48('1106')
              ? false
              : stryMutAct_9fa48('1105')
                ? true
                : (stryCov_9fa48('1105', '1106', '1107'),
                  state.status ===
                    (stryMutAct_9fa48('1108') ? '' : (stryCov_9fa48('1108'), 'COMPLETED')))
        ) {
          if (stryMutAct_9fa48('1109')) {
            {
            }
          } else {
            stryCov_9fa48('1109');
            await completedNode(state);
          }
        }
      }
    }
    return stryMutAct_9fa48('1110')
      ? {}
      : (stryCov_9fa48('1110'),
        {
          response: stryMutAct_9fa48('1113')
            ? output.response && '访谈已结束，非常感谢您拨冗参与！'
            : stryMutAct_9fa48('1112')
              ? false
              : stryMutAct_9fa48('1111')
                ? true
                : (stryCov_9fa48('1111', '1112', '1113'),
                  output.response ||
                    (stryMutAct_9fa48('1114')
                      ? ''
                      : (stryCov_9fa48('1114'), '访谈已结束，非常感谢您拨冗参与！'))),
          nextState: state,
        });
  }
}
