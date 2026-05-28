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
    if (stryMutAct_9fa48('2795')) {
      {
      }
    } else {
      stryCov_9fa48('2795');
      const { userId, content, isVoice } = input;
      info(
        stryMutAct_9fa48('2796') ? '' : (stryCov_9fa48('2796'), 'Processing message'),
        stryMutAct_9fa48('2797')
          ? {}
          : (stryCov_9fa48('2797'),
            {
              userId,
              isVoice,
              contentLength: content.length,
            })
      );
      try {
        if (stryMutAct_9fa48('2798')) {
          {
          }
        } else {
          stryCov_9fa48('2798');
          const state = await this.loadOrCreateState(userId);
          const result = await runInterviewGraph(
            state,
            stryMutAct_9fa48('2799')
              ? {}
              : (stryCov_9fa48('2799'),
                {
                  userId,
                  content,
                  isVoice: stryMutAct_9fa48('2802')
                    ? isVoice && false
                    : stryMutAct_9fa48('2801')
                      ? false
                      : stryMutAct_9fa48('2800')
                        ? true
                        : (stryCov_9fa48('2800', '2801', '2802'),
                          isVoice ||
                            (stryMutAct_9fa48('2803') ? true : (stryCov_9fa48('2803'), false))),
                })
          );
          if (
            stryMutAct_9fa48('2805')
              ? false
              : stryMutAct_9fa48('2804')
                ? true
                : (stryCov_9fa48('2804', '2805'), result.response)
          ) {
            if (stryMutAct_9fa48('2806')) {
              {
              }
            } else {
              stryCov_9fa48('2806');
              await this.saveResponse(userId, result.response);
            }
          }
          return stryMutAct_9fa48('2807')
            ? {}
            : (stryCov_9fa48('2807'),
              {
                success: stryMutAct_9fa48('2808') ? false : (stryCov_9fa48('2808'), true),
                response: result.response,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('2809')) {
          {
          }
        } else {
          stryCov_9fa48('2809');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('2810')
                ? ''
                : (stryCov_9fa48('2810'), 'Unknown error');
          error(
            stryMutAct_9fa48('2811')
              ? ''
              : (stryCov_9fa48('2811'), 'Conversation processing failed'),
            stryMutAct_9fa48('2812')
              ? {}
              : (stryCov_9fa48('2812'),
                {
                  error: errMsg,
                  userId,
                })
          );
          return stryMutAct_9fa48('2813')
            ? {}
            : (stryCov_9fa48('2813'),
              {
                success: stryMutAct_9fa48('2814') ? true : (stryCov_9fa48('2814'), false),
                error: errMsg,
              });
        }
      }
    }
  }
  private async loadOrCreateState(userId: string): Promise<InterviewState> {
    if (stryMutAct_9fa48('2815')) {
      {
      }
    } else {
      stryCov_9fa48('2815');
      return stryMutAct_9fa48('2816')
        ? {}
        : (stryCov_9fa48('2816'),
          {
            userId,
            status: stryMutAct_9fa48('2817') ? '' : (stryCov_9fa48('2817'), 'PENDING'),
            messages: stryMutAct_9fa48('2818') ? ['Stryker was here'] : (stryCov_9fa48('2818'), []),
            currentQuestion: 0,
            followupCount: 0,
            maxFollowups: 2,
            responses: stryMutAct_9fa48('2819')
              ? ['Stryker was here']
              : (stryCov_9fa48('2819'), []),
            reportGenerated: stryMutAct_9fa48('2820') ? true : (stryCov_9fa48('2820'), false),
            version: 1,
            originalVersion: 1,
            pendingMessages: stryMutAct_9fa48('2821')
              ? ['Stryker was here']
              : (stryCov_9fa48('2821'), []),
            pendingResponses: stryMutAct_9fa48('2822')
              ? ['Stryker was here']
              : (stryCov_9fa48('2822'), []),
          });
    }
  }
  private async saveResponse(userId: string, response: string) {
    if (stryMutAct_9fa48('2823')) {
      {
      }
    } else {
      stryCov_9fa48('2823');
      info(
        stryMutAct_9fa48('2824') ? '' : (stryCov_9fa48('2824'), 'Saving response'),
        stryMutAct_9fa48('2825')
          ? {}
          : (stryCov_9fa48('2825'),
            {
              userId,
              responseLength: response.length,
            })
      );
    }
  }
}
