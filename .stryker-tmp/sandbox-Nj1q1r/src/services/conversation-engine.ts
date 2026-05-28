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
import { runInterviewGraph } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';
export interface ProcessMessageInput {
  userId: string;
  content: string;
  isVoice?: boolean;
}
export interface ProcessMessageOutput {
  success: boolean;
  response?: string;
  error?: string;
}
export class ConversationEngine {
  async processMessage(input: ProcessMessageInput): Promise<ProcessMessageOutput> {
    if (stryMutAct_9fa48('0')) {
      {
      }
    } else {
      stryCov_9fa48('0');
      const { userId, content, isVoice } = input;
      info(
        stryMutAct_9fa48('1') ? '' : (stryCov_9fa48('1'), 'Processing message'),
        stryMutAct_9fa48('2')
          ? {}
          : (stryCov_9fa48('2'),
            {
              userId,
              isVoice,
              contentLength: content.length,
            })
      );
      try {
        if (stryMutAct_9fa48('3')) {
          {
          }
        } else {
          stryCov_9fa48('3');
          const state = await this.loadOrCreateState(userId);
          const result = await runInterviewGraph(
            state,
            stryMutAct_9fa48('4')
              ? {}
              : (stryCov_9fa48('4'),
                {
                  userId,
                  content,
                  isVoice: stryMutAct_9fa48('7')
                    ? isVoice && false
                    : stryMutAct_9fa48('6')
                      ? false
                      : stryMutAct_9fa48('5')
                        ? true
                        : (stryCov_9fa48('5', '6', '7'),
                          isVoice || (stryMutAct_9fa48('8') ? true : (stryCov_9fa48('8'), false))),
                })
          );
          if (
            stryMutAct_9fa48('10')
              ? false
              : stryMutAct_9fa48('9')
                ? true
                : (stryCov_9fa48('9', '10'), result.response)
          ) {
            if (stryMutAct_9fa48('11')) {
              {
              }
            } else {
              stryCov_9fa48('11');
              await this.saveResponse(userId, result.response);
            }
          }
          return stryMutAct_9fa48('12')
            ? {}
            : (stryCov_9fa48('12'),
              {
                success: stryMutAct_9fa48('13') ? false : (stryCov_9fa48('13'), true),
                response: result.response,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('14')) {
          {
          }
        } else {
          stryCov_9fa48('14');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('15')
                ? ''
                : (stryCov_9fa48('15'), 'Unknown error');
          error(
            stryMutAct_9fa48('16') ? '' : (stryCov_9fa48('16'), 'Conversation processing failed'),
            stryMutAct_9fa48('17')
              ? {}
              : (stryCov_9fa48('17'),
                {
                  error: errMsg,
                  userId,
                })
          );
          return stryMutAct_9fa48('18')
            ? {}
            : (stryCov_9fa48('18'),
              {
                success: stryMutAct_9fa48('19') ? true : (stryCov_9fa48('19'), false),
                error: errMsg,
              });
        }
      }
    }
  }
  private async loadOrCreateState(userId: string): Promise<InterviewState> {
    if (stryMutAct_9fa48('20')) {
      {
      }
    } else {
      stryCov_9fa48('20');
      return stryMutAct_9fa48('21')
        ? {}
        : (stryCov_9fa48('21'),
          {
            userId,
            status: stryMutAct_9fa48('22') ? '' : (stryCov_9fa48('22'), 'PENDING'),
            messages: stryMutAct_9fa48('23') ? ['Stryker was here'] : (stryCov_9fa48('23'), []),
            currentQuestion: 0,
            followupCount: 0,
            maxFollowups: 2,
            responses: stryMutAct_9fa48('24') ? ['Stryker was here'] : (stryCov_9fa48('24'), []),
            reportGenerated: stryMutAct_9fa48('25') ? true : (stryCov_9fa48('25'), false),
            version: 1,
            originalVersion: 1,
            pendingMessages: stryMutAct_9fa48('26')
              ? ['Stryker was here']
              : (stryCov_9fa48('26'), []),
            pendingResponses: stryMutAct_9fa48('27')
              ? ['Stryker was here']
              : (stryCov_9fa48('27'), []),
          });
    }
  }
  private async saveResponse(userId: string, response: string) {
    if (stryMutAct_9fa48('28')) {
      {
      }
    } else {
      stryCov_9fa48('28');
      info(
        stryMutAct_9fa48('29') ? '' : (stryCov_9fa48('29'), 'Saving response'),
        stryMutAct_9fa48('30')
          ? {}
          : (stryCov_9fa48('30'),
            {
              userId,
              responseLength: response.length,
            })
      );
    }
  }
}
