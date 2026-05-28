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
    if (stryMutAct_9fa48('60')) {
      {
      }
    } else {
      stryCov_9fa48('60');
      const { userId, content, isVoice } = input;
      info(
        stryMutAct_9fa48('61') ? '' : (stryCov_9fa48('61'), 'Processing message'),
        stryMutAct_9fa48('62')
          ? {}
          : (stryCov_9fa48('62'),
            {
              userId,
              isVoice,
              contentLength: content.length,
            })
      );
      try {
        if (stryMutAct_9fa48('63')) {
          {
          }
        } else {
          stryCov_9fa48('63');
          const state = await this.loadOrCreateState(userId);
          const result = await runInterviewGraph(
            state,
            stryMutAct_9fa48('64')
              ? {}
              : (stryCov_9fa48('64'),
                {
                  userId,
                  content,
                  isVoice: stryMutAct_9fa48('67')
                    ? isVoice && false
                    : stryMutAct_9fa48('66')
                      ? false
                      : stryMutAct_9fa48('65')
                        ? true
                        : (stryCov_9fa48('65', '66', '67'),
                          isVoice ||
                            (stryMutAct_9fa48('68') ? true : (stryCov_9fa48('68'), false))),
                })
          );
          if (
            stryMutAct_9fa48('70')
              ? false
              : stryMutAct_9fa48('69')
                ? true
                : (stryCov_9fa48('69', '70'), result.response)
          ) {
            if (stryMutAct_9fa48('71')) {
              {
              }
            } else {
              stryCov_9fa48('71');
              await this.saveResponse(userId, result.response);
            }
          }
          return stryMutAct_9fa48('72')
            ? {}
            : (stryCov_9fa48('72'),
              {
                success: stryMutAct_9fa48('73') ? false : (stryCov_9fa48('73'), true),
                response: result.response,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('74')) {
          {
          }
        } else {
          stryCov_9fa48('74');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('75')
                ? ''
                : (stryCov_9fa48('75'), 'Unknown error');
          error(
            stryMutAct_9fa48('76') ? '' : (stryCov_9fa48('76'), 'Conversation processing failed'),
            stryMutAct_9fa48('77')
              ? {}
              : (stryCov_9fa48('77'),
                {
                  error: errMsg,
                  userId,
                })
          );
          return stryMutAct_9fa48('78')
            ? {}
            : (stryCov_9fa48('78'),
              {
                success: stryMutAct_9fa48('79') ? true : (stryCov_9fa48('79'), false),
                error: errMsg,
              });
        }
      }
    }
  }
  private async loadOrCreateState(userId: string): Promise<InterviewState> {
    if (stryMutAct_9fa48('80')) {
      {
      }
    } else {
      stryCov_9fa48('80');
      return stryMutAct_9fa48('81')
        ? {}
        : (stryCov_9fa48('81'),
          {
            userId,
            status: stryMutAct_9fa48('82') ? '' : (stryCov_9fa48('82'), 'PENDING'),
            messages: stryMutAct_9fa48('83') ? ['Stryker was here'] : (stryCov_9fa48('83'), []),
            currentQuestion: 0,
            followupCount: 0,
            maxFollowups: 2,
            responses: stryMutAct_9fa48('84') ? ['Stryker was here'] : (stryCov_9fa48('84'), []),
            reportGenerated: stryMutAct_9fa48('85') ? true : (stryCov_9fa48('85'), false),
            version: 1,
            originalVersion: 1,
            pendingMessages: stryMutAct_9fa48('86')
              ? ['Stryker was here']
              : (stryCov_9fa48('86'), []),
            pendingResponses: stryMutAct_9fa48('87')
              ? ['Stryker was here']
              : (stryCov_9fa48('87'), []),
          });
    }
  }
  private async saveResponse(userId: string, response: string) {
    if (stryMutAct_9fa48('88')) {
      {
      }
    } else {
      stryCov_9fa48('88');
      info(
        stryMutAct_9fa48('89') ? '' : (stryCov_9fa48('89'), 'Saving response'),
        stryMutAct_9fa48('90')
          ? {}
          : (stryCov_9fa48('90'),
            {
              userId,
              responseLength: response.length,
            })
      );
    }
  }
}
