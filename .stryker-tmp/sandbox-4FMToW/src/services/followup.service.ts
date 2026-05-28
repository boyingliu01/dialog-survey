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
import type { InterviewState } from '../core/types/index.js';
import { DEFAULT_MODEL, VolcengineLLM } from '../integrations/llm/volcengine.js';
import { info, warn } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';
export interface StructuredResponse {
  thinking: string;
  strategy: number;
  action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY';
  response: string;
}
export interface SmartResponseResult {
  response: string;
  action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY';
  shouldProceedToNext: boolean;
  shouldEndInterview: boolean;
}
export const FALLBACK_RESPONSE = stryMutAct_9fa48('370')
  ? ''
  : (stryCov_9fa48('370'), '感谢您的回答，我们继续下一个话题。');
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  if (stryMutAct_9fa48('371')) {
    {
    }
  } else {
    stryCov_9fa48('371');
    let content = stryMutAct_9fa48('372') ? rawContent : (stryCov_9fa48('372'), rawContent.trim());
    const jsonMatch = content.match(
      stryMutAct_9fa48('379')
        ? /```(?:json)?\s*([\s\s]*?)```/
        : stryMutAct_9fa48('378')
          ? /```(?:json)?\s*([\S\S]*?)```/
          : stryMutAct_9fa48('377')
            ? /```(?:json)?\s*([^\s\S]*?)```/
            : stryMutAct_9fa48('376')
              ? /```(?:json)?\s*([\s\S])```/
              : stryMutAct_9fa48('375')
                ? /```(?:json)?\S*([\s\S]*?)```/
                : stryMutAct_9fa48('374')
                  ? /```(?:json)?\s([\s\S]*?)```/
                  : stryMutAct_9fa48('373')
                    ? /```(?:json)\s*([\s\S]*?)```/
                    : (stryCov_9fa48('373', '374', '375', '376', '377', '378', '379'),
                      /```(?:json)?\s*([\s\S]*?)```/)
    );
    if (
      stryMutAct_9fa48('381')
        ? false
        : stryMutAct_9fa48('380')
          ? true
          : (stryCov_9fa48('380', '381'), jsonMatch)
    ) {
      if (stryMutAct_9fa48('382')) {
        {
        }
      } else {
        stryCov_9fa48('382');
        content = stryMutAct_9fa48('383')
          ? jsonMatch[1]
          : (stryCov_9fa48('383'), jsonMatch[1].trim());
      }
    }
    try {
      if (stryMutAct_9fa48('384')) {
        {
        }
      } else {
        stryCov_9fa48('384');
        const parsed = JSON.parse(content);
        if (
          stryMutAct_9fa48('387')
            ? !parsed.action && !parsed.response
            : stryMutAct_9fa48('386')
              ? false
              : stryMutAct_9fa48('385')
                ? true
                : (stryCov_9fa48('385', '386', '387'),
                  (stryMutAct_9fa48('388')
                    ? parsed.action
                    : (stryCov_9fa48('388'), !parsed.action)) ||
                    (stryMutAct_9fa48('389')
                      ? parsed.response
                      : (stryCov_9fa48('389'), !parsed.response)))
        )
          return null;
        const validActions = stryMutAct_9fa48('390')
          ? []
          : (stryCov_9fa48('390'),
            [
              stryMutAct_9fa48('391') ? '' : (stryCov_9fa48('391'), 'NEXT'),
              stryMutAct_9fa48('392') ? '' : (stryCov_9fa48('392'), 'FOLLOWUP'),
              stryMutAct_9fa48('393') ? '' : (stryCov_9fa48('393'), 'END'),
              stryMutAct_9fa48('394') ? '' : (stryCov_9fa48('394'), 'STAY'),
            ]);
        const action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY' = validActions.includes(parsed.action)
          ? parsed.action
          : stryMutAct_9fa48('395')
            ? ''
            : (stryCov_9fa48('395'), 'STAY');
        return stryMutAct_9fa48('396')
          ? {}
          : (stryCov_9fa48('396'),
            {
              thinking: stryMutAct_9fa48('399')
                ? parsed.thinking && ''
                : stryMutAct_9fa48('398')
                  ? false
                  : stryMutAct_9fa48('397')
                    ? true
                    : (stryCov_9fa48('397', '398', '399'),
                      parsed.thinking ||
                        (stryMutAct_9fa48('400')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('400'), ''))),
              strategy: stryMutAct_9fa48('403')
                ? parsed.strategy && 1
                : stryMutAct_9fa48('402')
                  ? false
                  : stryMutAct_9fa48('401')
                    ? true
                    : (stryCov_9fa48('401', '402', '403'), parsed.strategy || 1),
              action,
              response: parsed.response,
            });
      }
    } catch {
      if (stryMutAct_9fa48('404')) {
        {
        }
      } else {
        stryCov_9fa48('404');
        return null;
      }
    }
  }
}
export function smartTruncate(text: string, maxLength: number): string {
  if (stryMutAct_9fa48('405')) {
    {
    }
  } else {
    stryCov_9fa48('405');
    if (
      stryMutAct_9fa48('409')
        ? text.length > maxLength
        : stryMutAct_9fa48('408')
          ? text.length < maxLength
          : stryMutAct_9fa48('407')
            ? false
            : stryMutAct_9fa48('406')
              ? true
              : (stryCov_9fa48('406', '407', '408', '409'), text.length <= maxLength)
    )
      return text;
    const threshold = Math.floor(
      stryMutAct_9fa48('410') ? maxLength / 0.7 : (stryCov_9fa48('410'), maxLength * 0.7)
    );
    const searchStart = stryMutAct_9fa48('411')
      ? Math.max(threshold, maxLength - 10)
      : (stryCov_9fa48('411'),
        Math.min(
          threshold,
          stryMutAct_9fa48('412') ? maxLength + 10 : (stryCov_9fa48('412'), maxLength - 10)
        ));
    const punctuations = stryMutAct_9fa48('413')
      ? []
      : (stryCov_9fa48('413'),
        [
          stryMutAct_9fa48('414') ? '' : (stryCov_9fa48('414'), '。'),
          stryMutAct_9fa48('415') ? '' : (stryCov_9fa48('415'), '！'),
          stryMutAct_9fa48('416') ? '' : (stryCov_9fa48('416'), '？'),
          stryMutAct_9fa48('417') ? '' : (stryCov_9fa48('417'), '.'),
          stryMutAct_9fa48('418') ? '' : (stryCov_9fa48('418'), '!'),
          stryMutAct_9fa48('419') ? '' : (stryCov_9fa48('419'), '?'),
        ]);
    let lastPunctuation = stryMutAct_9fa48('420') ? +1 : (stryCov_9fa48('420'), -1);
    for (const punct of punctuations) {
      if (stryMutAct_9fa48('421')) {
        {
        }
      } else {
        stryCov_9fa48('421');
        const idx = text.lastIndexOf(punct, maxLength);
        if (
          stryMutAct_9fa48('424')
            ? idx > searchStart || idx > lastPunctuation
            : stryMutAct_9fa48('423')
              ? false
              : stryMutAct_9fa48('422')
                ? true
                : (stryCov_9fa48('422', '423', '424'),
                  (stryMutAct_9fa48('427')
                    ? idx <= searchStart
                    : stryMutAct_9fa48('426')
                      ? idx >= searchStart
                      : stryMutAct_9fa48('425')
                        ? true
                        : (stryCov_9fa48('425', '426', '427'), idx > searchStart)) &&
                    (stryMutAct_9fa48('430')
                      ? idx <= lastPunctuation
                      : stryMutAct_9fa48('429')
                        ? idx >= lastPunctuation
                        : stryMutAct_9fa48('428')
                          ? true
                          : (stryCov_9fa48('428', '429', '430'), idx > lastPunctuation)))
        )
          lastPunctuation = idx;
      }
    }
    if (
      stryMutAct_9fa48('434')
        ? lastPunctuation <= threshold
        : stryMutAct_9fa48('433')
          ? lastPunctuation >= threshold
          : stryMutAct_9fa48('432')
            ? false
            : stryMutAct_9fa48('431')
              ? true
              : (stryCov_9fa48('431', '432', '433', '434'), lastPunctuation > threshold)
    )
      return stryMutAct_9fa48('435')
        ? ``
        : (stryCov_9fa48('435'),
          `${stryMutAct_9fa48('436') ? text : (stryCov_9fa48('436'), text.slice(0, stryMutAct_9fa48('437') ? lastPunctuation - 1 : (stryCov_9fa48('437'), lastPunctuation + 1)))}...`);
    return stryMutAct_9fa48('438')
      ? ``
      : (stryCov_9fa48('438'),
        `${stryMutAct_9fa48('439') ? text : (stryCov_9fa48('439'), text.slice(0, stryMutAct_9fa48('440') ? maxLength + 3 : (stryCov_9fa48('440'), maxLength - 3)))}...`);
  }
}
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  if (stryMutAct_9fa48('441')) {
    {
    }
  } else {
    stryCov_9fa48('441');
    const llm = VolcengineLLM.fromEnv();
    const conversationHistory = stryMutAct_9fa48('442')
      ? state.messages
          .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
          .join('\n')
      : (stryCov_9fa48('442'),
        state.messages
          .slice(stryMutAct_9fa48('443') ? +6 : (stryCov_9fa48('443'), -6))
          .map(
            stryMutAct_9fa48('444')
              ? () => undefined
              : (stryCov_9fa48('444'),
                (m) =>
                  stryMutAct_9fa48('445')
                    ? ``
                    : (stryCov_9fa48('445'),
                      `${(stryMutAct_9fa48('448') ? m.role !== 'user' : stryMutAct_9fa48('447') ? false : stryMutAct_9fa48('446') ? true : (stryCov_9fa48('446', '447', '448'), m.role === (stryMutAct_9fa48('449') ? '' : (stryCov_9fa48('449'), 'user')))) ? (stryMutAct_9fa48('450') ? '' : (stryCov_9fa48('450'), '用户')) : stryMutAct_9fa48('451') ? '' : ((stryCov_9fa48('451'), '主持人'))}: ${m.content}`))
          )
          .join(stryMutAct_9fa48('452') ? '' : (stryCov_9fa48('452'), '\n')));
    const userName = stryMutAct_9fa48('455')
      ? state.userName && '受访者'
      : stryMutAct_9fa48('454')
        ? false
        : stryMutAct_9fa48('453')
          ? true
          : (stryCov_9fa48('453', '454', '455'),
            state.userName || (stryMutAct_9fa48('456') ? '' : (stryCov_9fa48('456'), '受访者')));
    const lastQuestionFlag = isLastQuestion
      ? stryMutAct_9fa48('457')
        ? ''
        : (stryCov_9fa48('457'),
          '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n')
      : stryMutAct_9fa48('458')
        ? 'Stryker was here!'
        : (stryCov_9fa48('458'), '');
    if (
      stryMutAct_9fa48('460')
        ? false
        : stryMutAct_9fa48('459')
          ? true
          : (stryCov_9fa48('459', '460'), customPrompt)
    ) {
      if (stryMutAct_9fa48('461')) {
        {
        }
      } else {
        stryCov_9fa48('461');
        const prompt = customPrompt
          .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
          .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
          .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
          .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
          .replace(/\{\{userAnswer\}\}/g, userAnswer)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);
        try {
          if (stryMutAct_9fa48('462')) {
            {
            }
          } else {
            stryCov_9fa48('462');
            const response = await withRetry(
              stryMutAct_9fa48('463')
                ? () => undefined
                : (stryCov_9fa48('463'),
                  () =>
                    llm.chat(
                      stryMutAct_9fa48('464')
                        ? {}
                        : (stryCov_9fa48('464'),
                          {
                            model: DEFAULT_MODEL,
                            messages: stryMutAct_9fa48('465')
                              ? []
                              : (stryCov_9fa48('465'),
                                [
                                  stryMutAct_9fa48('466')
                                    ? {}
                                    : (stryCov_9fa48('466'),
                                      {
                                        role: stryMutAct_9fa48('467')
                                          ? ''
                                          : (stryCov_9fa48('467'), 'user'),
                                        content: prompt,
                                      }),
                                ]),
                          })
                    ))
            );
            const parsed = parseLLMResponse(response.content);
            if (
              stryMutAct_9fa48('470')
                ? false
                : stryMutAct_9fa48('469')
                  ? true
                  : stryMutAct_9fa48('468')
                    ? parsed
                    : (stryCov_9fa48('468', '469', '470'), !parsed)
            ) {
              if (stryMutAct_9fa48('471')) {
                {
                }
              } else {
                stryCov_9fa48('471');
                warn(
                  stryMutAct_9fa48('472')
                    ? ''
                    : (stryCov_9fa48('472'), 'Failed to parse custom prompt result, falling back')
                );
                return stryMutAct_9fa48('473')
                  ? {}
                  : (stryCov_9fa48('473'),
                    {
                      response: FALLBACK_RESPONSE,
                      action: stryMutAct_9fa48('474') ? '' : (stryCov_9fa48('474'), 'NEXT'),
                      shouldProceedToNext: stryMutAct_9fa48('475')
                        ? false
                        : (stryCov_9fa48('475'), true),
                      shouldEndInterview: stryMutAct_9fa48('476')
                        ? true
                        : (stryCov_9fa48('476'), false),
                    });
              }
            }
            if (
              stryMutAct_9fa48('479')
                ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
                : stryMutAct_9fa48('478')
                  ? false
                  : stryMutAct_9fa48('477')
                    ? true
                    : (stryCov_9fa48('477', '478', '479'),
                      (stryMutAct_9fa48('481')
                        ? parsed.action !== 'FOLLOWUP'
                        : stryMutAct_9fa48('480')
                          ? true
                          : (stryCov_9fa48('480', '481'),
                            parsed.action ===
                              (stryMutAct_9fa48('482')
                                ? ''
                                : (stryCov_9fa48('482'), 'FOLLOWUP')))) &&
                        (stryMutAct_9fa48('485')
                          ? state.followupCount < state.maxFollowups
                          : stryMutAct_9fa48('484')
                            ? state.followupCount > state.maxFollowups
                            : stryMutAct_9fa48('483')
                              ? true
                              : (stryCov_9fa48('483', '484', '485'),
                                state.followupCount >= state.maxFollowups)))
            )
              parsed.action = stryMutAct_9fa48('486') ? '' : (stryCov_9fa48('486'), 'NEXT');
            return stryMutAct_9fa48('487')
              ? {}
              : (stryCov_9fa48('487'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: parsed.action,
                  shouldProceedToNext: stryMutAct_9fa48('490')
                    ? parsed.action !== 'NEXT'
                    : stryMutAct_9fa48('489')
                      ? false
                      : stryMutAct_9fa48('488')
                        ? true
                        : (stryCov_9fa48('488', '489', '490'),
                          parsed.action ===
                            (stryMutAct_9fa48('491') ? '' : (stryCov_9fa48('491'), 'NEXT'))),
                  shouldEndInterview: stryMutAct_9fa48('494')
                    ? parsed.action !== 'END'
                    : stryMutAct_9fa48('493')
                      ? false
                      : stryMutAct_9fa48('492')
                        ? true
                        : (stryCov_9fa48('492', '493', '494'),
                          parsed.action ===
                            (stryMutAct_9fa48('495') ? '' : (stryCov_9fa48('495'), 'END'))),
                });
          }
        } catch {
          if (stryMutAct_9fa48('496')) {
            {
            }
          } else {
            stryCov_9fa48('496');
            warn(
              stryMutAct_9fa48('497') ? '' : (stryCov_9fa48('497'), 'Custom prompt LLM call failed')
            );
            return stryMutAct_9fa48('498')
              ? {}
              : (stryCov_9fa48('498'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('499') ? '' : (stryCov_9fa48('499'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('500')
                    ? false
                    : (stryCov_9fa48('500'), true),
                  shouldEndInterview: stryMutAct_9fa48('501')
                    ? true
                    : (stryCov_9fa48('501'), false),
                });
          }
        }
      }
    }

    // Default system prompt
    const prompt = promptService.render(
      stryMutAct_9fa48('502') ? '' : (stryCov_9fa48('502'), 'generateSmartResponse'),
      stryMutAct_9fa48('503')
        ? {}
        : (stryCov_9fa48('503'),
          {
            conversationHistory,
            currentQuestion,
            followupCount: String(state.followupCount),
            maxFollowups: String(state.maxFollowups),
            userAnswer,
            userName,
            lastQuestionFlag,
          })
    );
    try {
      if (stryMutAct_9fa48('504')) {
        {
        }
      } else {
        stryCov_9fa48('504');
        const response = await withRetry(
          stryMutAct_9fa48('505')
            ? () => undefined
            : (stryCov_9fa48('505'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('506')
                    ? {}
                    : (stryCov_9fa48('506'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('507')
                          ? []
                          : (stryCov_9fa48('507'),
                            [
                              stryMutAct_9fa48('508')
                                ? {}
                                : (stryCov_9fa48('508'),
                                  {
                                    role: stryMutAct_9fa48('509')
                                      ? ''
                                      : (stryCov_9fa48('509'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                      })
                ))
        );
        const parsed = parseLLMResponse(response.content);
        if (
          stryMutAct_9fa48('512')
            ? false
            : stryMutAct_9fa48('511')
              ? true
              : stryMutAct_9fa48('510')
                ? parsed
                : (stryCov_9fa48('510', '511', '512'), !parsed)
        ) {
          if (stryMutAct_9fa48('513')) {
            {
            }
          } else {
            stryCov_9fa48('513');
            info(
              stryMutAct_9fa48('514')
                ? ''
                : (stryCov_9fa48('514'), 'Failed to parse LLM response, using fallback')
            );
            return stryMutAct_9fa48('515')
              ? {}
              : (stryCov_9fa48('515'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('516') ? '' : (stryCov_9fa48('516'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('517')
                    ? false
                    : (stryCov_9fa48('517'), true),
                  shouldEndInterview: stryMutAct_9fa48('518')
                    ? true
                    : (stryCov_9fa48('518'), false),
                });
          }
        }
        if (
          stryMutAct_9fa48('521')
            ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
            : stryMutAct_9fa48('520')
              ? false
              : stryMutAct_9fa48('519')
                ? true
                : (stryCov_9fa48('519', '520', '521'),
                  (stryMutAct_9fa48('523')
                    ? parsed.action !== 'FOLLOWUP'
                    : stryMutAct_9fa48('522')
                      ? true
                      : (stryCov_9fa48('522', '523'),
                        parsed.action ===
                          (stryMutAct_9fa48('524') ? '' : (stryCov_9fa48('524'), 'FOLLOWUP')))) &&
                    (stryMutAct_9fa48('527')
                      ? state.followupCount < state.maxFollowups
                      : stryMutAct_9fa48('526')
                        ? state.followupCount > state.maxFollowups
                        : stryMutAct_9fa48('525')
                          ? true
                          : (stryCov_9fa48('525', '526', '527'),
                            state.followupCount >= state.maxFollowups)))
        ) {
          if (stryMutAct_9fa48('528')) {
            {
            }
          } else {
            stryCov_9fa48('528');
            info(
              stryMutAct_9fa48('529')
                ? ''
                : (stryCov_9fa48('529'), 'Followup limit exceeded, forcing NEXT')
            );
            return stryMutAct_9fa48('530')
              ? {}
              : (stryCov_9fa48('530'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: stryMutAct_9fa48('531') ? '' : (stryCov_9fa48('531'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('532')
                    ? false
                    : (stryCov_9fa48('532'), true),
                  shouldEndInterview: stryMutAct_9fa48('533')
                    ? true
                    : (stryCov_9fa48('533'), false),
                });
          }
        }
        return stryMutAct_9fa48('534')
          ? {}
          : (stryCov_9fa48('534'),
            {
              response: smartTruncate(parsed.response, 150),
              action: parsed.action,
              shouldProceedToNext: stryMutAct_9fa48('537')
                ? parsed.action !== 'NEXT'
                : stryMutAct_9fa48('536')
                  ? false
                  : stryMutAct_9fa48('535')
                    ? true
                    : (stryCov_9fa48('535', '536', '537'),
                      parsed.action ===
                        (stryMutAct_9fa48('538') ? '' : (stryCov_9fa48('538'), 'NEXT'))),
              shouldEndInterview: stryMutAct_9fa48('541')
                ? parsed.action !== 'END'
                : stryMutAct_9fa48('540')
                  ? false
                  : stryMutAct_9fa48('539')
                    ? true
                    : (stryCov_9fa48('539', '540', '541'),
                      parsed.action ===
                        (stryMutAct_9fa48('542') ? '' : (stryCov_9fa48('542'), 'END'))),
            });
      }
    } catch (error) {
      if (stryMutAct_9fa48('543')) {
        {
        }
      } else {
        stryCov_9fa48('543');
        const errMsg =
          error instanceof Error
            ? error.message
            : stryMutAct_9fa48('544')
              ? ''
              : (stryCov_9fa48('544'), 'Unknown error');
        info(
          stryMutAct_9fa48('545') ? '' : (stryCov_9fa48('545'), 'Smart response generation failed'),
          stryMutAct_9fa48('546')
            ? {}
            : (stryCov_9fa48('546'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('547')
          ? {}
          : (stryCov_9fa48('547'),
            {
              response: FALLBACK_RESPONSE,
              action: stryMutAct_9fa48('548') ? '' : (stryCov_9fa48('548'), 'NEXT'),
              shouldProceedToNext: stryMutAct_9fa48('549') ? false : (stryCov_9fa48('549'), true),
              shouldEndInterview: stryMutAct_9fa48('550') ? true : (stryCov_9fa48('550'), false),
            });
      }
    }
  }
}
