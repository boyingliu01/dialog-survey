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
export const FALLBACK_RESPONSE = stryMutAct_9fa48('251')
  ? ''
  : (stryCov_9fa48('251'), '感谢您的回答，我们继续下一个话题。');
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  if (stryMutAct_9fa48('252')) {
    {
    }
  } else {
    stryCov_9fa48('252');
    let content = stryMutAct_9fa48('253') ? rawContent : (stryCov_9fa48('253'), rawContent.trim());
    const jsonMatch = content.match(
      stryMutAct_9fa48('260')
        ? /```(?:json)?\s*([\s\s]*?)```/
        : stryMutAct_9fa48('259')
          ? /```(?:json)?\s*([\S\S]*?)```/
          : stryMutAct_9fa48('258')
            ? /```(?:json)?\s*([^\s\S]*?)```/
            : stryMutAct_9fa48('257')
              ? /```(?:json)?\s*([\s\S])```/
              : stryMutAct_9fa48('256')
                ? /```(?:json)?\S*([\s\S]*?)```/
                : stryMutAct_9fa48('255')
                  ? /```(?:json)?\s([\s\S]*?)```/
                  : stryMutAct_9fa48('254')
                    ? /```(?:json)\s*([\s\S]*?)```/
                    : (stryCov_9fa48('254', '255', '256', '257', '258', '259', '260'),
                      /```(?:json)?\s*([\s\S]*?)```/)
    );
    if (
      stryMutAct_9fa48('262')
        ? false
        : stryMutAct_9fa48('261')
          ? true
          : (stryCov_9fa48('261', '262'), jsonMatch)
    ) {
      if (stryMutAct_9fa48('263')) {
        {
        }
      } else {
        stryCov_9fa48('263');
        content = stryMutAct_9fa48('264')
          ? jsonMatch[1]
          : (stryCov_9fa48('264'), jsonMatch[1].trim());
      }
    }
    try {
      if (stryMutAct_9fa48('265')) {
        {
        }
      } else {
        stryCov_9fa48('265');
        const parsed = JSON.parse(content);
        if (
          stryMutAct_9fa48('268')
            ? !parsed.action && !parsed.response
            : stryMutAct_9fa48('267')
              ? false
              : stryMutAct_9fa48('266')
                ? true
                : (stryCov_9fa48('266', '267', '268'),
                  (stryMutAct_9fa48('269')
                    ? parsed.action
                    : (stryCov_9fa48('269'), !parsed.action)) ||
                    (stryMutAct_9fa48('270')
                      ? parsed.response
                      : (stryCov_9fa48('270'), !parsed.response)))
        )
          return null;
        const validActions = stryMutAct_9fa48('271')
          ? []
          : (stryCov_9fa48('271'),
            [
              stryMutAct_9fa48('272') ? '' : (stryCov_9fa48('272'), 'NEXT'),
              stryMutAct_9fa48('273') ? '' : (stryCov_9fa48('273'), 'FOLLOWUP'),
              stryMutAct_9fa48('274') ? '' : (stryCov_9fa48('274'), 'END'),
              stryMutAct_9fa48('275') ? '' : (stryCov_9fa48('275'), 'STAY'),
            ]);
        const action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY' = validActions.includes(parsed.action)
          ? parsed.action
          : stryMutAct_9fa48('276')
            ? ''
            : (stryCov_9fa48('276'), 'STAY');
        return stryMutAct_9fa48('277')
          ? {}
          : (stryCov_9fa48('277'),
            {
              thinking: stryMutAct_9fa48('280')
                ? parsed.thinking && ''
                : stryMutAct_9fa48('279')
                  ? false
                  : stryMutAct_9fa48('278')
                    ? true
                    : (stryCov_9fa48('278', '279', '280'),
                      parsed.thinking ||
                        (stryMutAct_9fa48('281')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('281'), ''))),
              strategy: stryMutAct_9fa48('284')
                ? parsed.strategy && 1
                : stryMutAct_9fa48('283')
                  ? false
                  : stryMutAct_9fa48('282')
                    ? true
                    : (stryCov_9fa48('282', '283', '284'), parsed.strategy || 1),
              action,
              response: parsed.response,
            });
      }
    } catch {
      if (stryMutAct_9fa48('285')) {
        {
        }
      } else {
        stryCov_9fa48('285');
        return null;
      }
    }
  }
}
export function smartTruncate(text: string, maxLength: number): string {
  if (stryMutAct_9fa48('286')) {
    {
    }
  } else {
    stryCov_9fa48('286');
    if (
      stryMutAct_9fa48('290')
        ? text.length > maxLength
        : stryMutAct_9fa48('289')
          ? text.length < maxLength
          : stryMutAct_9fa48('288')
            ? false
            : stryMutAct_9fa48('287')
              ? true
              : (stryCov_9fa48('287', '288', '289', '290'), text.length <= maxLength)
    )
      return text;
    const threshold = Math.floor(
      stryMutAct_9fa48('291') ? maxLength / 0.7 : (stryCov_9fa48('291'), maxLength * 0.7)
    );
    const searchStart = stryMutAct_9fa48('292')
      ? Math.max(threshold, maxLength - 10)
      : (stryCov_9fa48('292'),
        Math.min(
          threshold,
          stryMutAct_9fa48('293') ? maxLength + 10 : (stryCov_9fa48('293'), maxLength - 10)
        ));
    const punctuations = stryMutAct_9fa48('294')
      ? []
      : (stryCov_9fa48('294'),
        [
          stryMutAct_9fa48('295') ? '' : (stryCov_9fa48('295'), '。'),
          stryMutAct_9fa48('296') ? '' : (stryCov_9fa48('296'), '！'),
          stryMutAct_9fa48('297') ? '' : (stryCov_9fa48('297'), '？'),
          stryMutAct_9fa48('298') ? '' : (stryCov_9fa48('298'), '.'),
          stryMutAct_9fa48('299') ? '' : (stryCov_9fa48('299'), '!'),
          stryMutAct_9fa48('300') ? '' : (stryCov_9fa48('300'), '?'),
        ]);
    let lastPunctuation = stryMutAct_9fa48('301') ? +1 : (stryCov_9fa48('301'), -1);
    for (const punct of punctuations) {
      if (stryMutAct_9fa48('302')) {
        {
        }
      } else {
        stryCov_9fa48('302');
        const idx = text.lastIndexOf(punct, maxLength);
        if (
          stryMutAct_9fa48('305')
            ? idx > searchStart || idx > lastPunctuation
            : stryMutAct_9fa48('304')
              ? false
              : stryMutAct_9fa48('303')
                ? true
                : (stryCov_9fa48('303', '304', '305'),
                  (stryMutAct_9fa48('308')
                    ? idx <= searchStart
                    : stryMutAct_9fa48('307')
                      ? idx >= searchStart
                      : stryMutAct_9fa48('306')
                        ? true
                        : (stryCov_9fa48('306', '307', '308'), idx > searchStart)) &&
                    (stryMutAct_9fa48('311')
                      ? idx <= lastPunctuation
                      : stryMutAct_9fa48('310')
                        ? idx >= lastPunctuation
                        : stryMutAct_9fa48('309')
                          ? true
                          : (stryCov_9fa48('309', '310', '311'), idx > lastPunctuation)))
        )
          lastPunctuation = idx;
      }
    }
    if (
      stryMutAct_9fa48('315')
        ? lastPunctuation <= threshold
        : stryMutAct_9fa48('314')
          ? lastPunctuation >= threshold
          : stryMutAct_9fa48('313')
            ? false
            : stryMutAct_9fa48('312')
              ? true
              : (stryCov_9fa48('312', '313', '314', '315'), lastPunctuation > threshold)
    )
      return stryMutAct_9fa48('316')
        ? ``
        : (stryCov_9fa48('316'),
          `${stryMutAct_9fa48('317') ? text : (stryCov_9fa48('317'), text.slice(0, stryMutAct_9fa48('318') ? lastPunctuation - 1 : (stryCov_9fa48('318'), lastPunctuation + 1)))}...`);
    return stryMutAct_9fa48('319')
      ? ``
      : (stryCov_9fa48('319'),
        `${stryMutAct_9fa48('320') ? text : (stryCov_9fa48('320'), text.slice(0, stryMutAct_9fa48('321') ? maxLength + 3 : (stryCov_9fa48('321'), maxLength - 3)))}...`);
  }
}
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  if (stryMutAct_9fa48('322')) {
    {
    }
  } else {
    stryCov_9fa48('322');
    const llm = VolcengineLLM.fromEnv();
    const conversationHistory = stryMutAct_9fa48('323')
      ? state.messages
          .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
          .join('\n')
      : (stryCov_9fa48('323'),
        state.messages
          .slice(stryMutAct_9fa48('324') ? +6 : (stryCov_9fa48('324'), -6))
          .map(
            stryMutAct_9fa48('325')
              ? () => undefined
              : (stryCov_9fa48('325'),
                (m) =>
                  stryMutAct_9fa48('326')
                    ? ``
                    : (stryCov_9fa48('326'),
                      `${(stryMutAct_9fa48('329') ? m.role !== 'user' : stryMutAct_9fa48('328') ? false : stryMutAct_9fa48('327') ? true : (stryCov_9fa48('327', '328', '329'), m.role === (stryMutAct_9fa48('330') ? '' : (stryCov_9fa48('330'), 'user')))) ? (stryMutAct_9fa48('331') ? '' : (stryCov_9fa48('331'), '用户')) : stryMutAct_9fa48('332') ? '' : ((stryCov_9fa48('332'), '主持人'))}: ${m.content}`))
          )
          .join(stryMutAct_9fa48('333') ? '' : (stryCov_9fa48('333'), '\n')));
    const userName = stryMutAct_9fa48('336')
      ? state.userName && '受访者'
      : stryMutAct_9fa48('335')
        ? false
        : stryMutAct_9fa48('334')
          ? true
          : (stryCov_9fa48('334', '335', '336'),
            state.userName || (stryMutAct_9fa48('337') ? '' : (stryCov_9fa48('337'), '受访者')));
    const lastQuestionFlag = isLastQuestion
      ? stryMutAct_9fa48('338')
        ? ''
        : (stryCov_9fa48('338'),
          '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n')
      : stryMutAct_9fa48('339')
        ? 'Stryker was here!'
        : (stryCov_9fa48('339'), '');
    if (
      stryMutAct_9fa48('341')
        ? false
        : stryMutAct_9fa48('340')
          ? true
          : (stryCov_9fa48('340', '341'), customPrompt)
    ) {
      if (stryMutAct_9fa48('342')) {
        {
        }
      } else {
        stryCov_9fa48('342');
        const prompt = customPrompt
          .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
          .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
          .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
          .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
          .replace(/\{\{userAnswer\}\}/g, userAnswer)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);
        try {
          if (stryMutAct_9fa48('343')) {
            {
            }
          } else {
            stryCov_9fa48('343');
            const response = await withRetry(
              stryMutAct_9fa48('344')
                ? () => undefined
                : (stryCov_9fa48('344'),
                  () =>
                    llm.chat(
                      stryMutAct_9fa48('345')
                        ? {}
                        : (stryCov_9fa48('345'),
                          {
                            model: DEFAULT_MODEL,
                            messages: stryMutAct_9fa48('346')
                              ? []
                              : (stryCov_9fa48('346'),
                                [
                                  stryMutAct_9fa48('347')
                                    ? {}
                                    : (stryCov_9fa48('347'),
                                      {
                                        role: stryMutAct_9fa48('348')
                                          ? ''
                                          : (stryCov_9fa48('348'), 'user'),
                                        content: prompt,
                                      }),
                                ]),
                          })
                    ))
            );
            const parsed = parseLLMResponse(response.content);
            if (
              stryMutAct_9fa48('351')
                ? false
                : stryMutAct_9fa48('350')
                  ? true
                  : stryMutAct_9fa48('349')
                    ? parsed
                    : (stryCov_9fa48('349', '350', '351'), !parsed)
            ) {
              if (stryMutAct_9fa48('352')) {
                {
                }
              } else {
                stryCov_9fa48('352');
                warn(
                  stryMutAct_9fa48('353')
                    ? ''
                    : (stryCov_9fa48('353'), 'Failed to parse custom prompt result, falling back')
                );
                return stryMutAct_9fa48('354')
                  ? {}
                  : (stryCov_9fa48('354'),
                    {
                      response: FALLBACK_RESPONSE,
                      action: stryMutAct_9fa48('355') ? '' : (stryCov_9fa48('355'), 'NEXT'),
                      shouldProceedToNext: stryMutAct_9fa48('356')
                        ? false
                        : (stryCov_9fa48('356'), true),
                      shouldEndInterview: stryMutAct_9fa48('357')
                        ? true
                        : (stryCov_9fa48('357'), false),
                    });
              }
            }
            if (
              stryMutAct_9fa48('360')
                ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
                : stryMutAct_9fa48('359')
                  ? false
                  : stryMutAct_9fa48('358')
                    ? true
                    : (stryCov_9fa48('358', '359', '360'),
                      (stryMutAct_9fa48('362')
                        ? parsed.action !== 'FOLLOWUP'
                        : stryMutAct_9fa48('361')
                          ? true
                          : (stryCov_9fa48('361', '362'),
                            parsed.action ===
                              (stryMutAct_9fa48('363')
                                ? ''
                                : (stryCov_9fa48('363'), 'FOLLOWUP')))) &&
                        (stryMutAct_9fa48('366')
                          ? state.followupCount < state.maxFollowups
                          : stryMutAct_9fa48('365')
                            ? state.followupCount > state.maxFollowups
                            : stryMutAct_9fa48('364')
                              ? true
                              : (stryCov_9fa48('364', '365', '366'),
                                state.followupCount >= state.maxFollowups)))
            )
              parsed.action = stryMutAct_9fa48('367') ? '' : (stryCov_9fa48('367'), 'NEXT');
            return stryMutAct_9fa48('368')
              ? {}
              : (stryCov_9fa48('368'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: parsed.action,
                  shouldProceedToNext: stryMutAct_9fa48('371')
                    ? parsed.action !== 'NEXT'
                    : stryMutAct_9fa48('370')
                      ? false
                      : stryMutAct_9fa48('369')
                        ? true
                        : (stryCov_9fa48('369', '370', '371'),
                          parsed.action ===
                            (stryMutAct_9fa48('372') ? '' : (stryCov_9fa48('372'), 'NEXT'))),
                  shouldEndInterview: stryMutAct_9fa48('375')
                    ? parsed.action !== 'END'
                    : stryMutAct_9fa48('374')
                      ? false
                      : stryMutAct_9fa48('373')
                        ? true
                        : (stryCov_9fa48('373', '374', '375'),
                          parsed.action ===
                            (stryMutAct_9fa48('376') ? '' : (stryCov_9fa48('376'), 'END'))),
                });
          }
        } catch {
          if (stryMutAct_9fa48('377')) {
            {
            }
          } else {
            stryCov_9fa48('377');
            warn(
              stryMutAct_9fa48('378') ? '' : (stryCov_9fa48('378'), 'Custom prompt LLM call failed')
            );
            return stryMutAct_9fa48('379')
              ? {}
              : (stryCov_9fa48('379'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('380') ? '' : (stryCov_9fa48('380'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('381')
                    ? false
                    : (stryCov_9fa48('381'), true),
                  shouldEndInterview: stryMutAct_9fa48('382')
                    ? true
                    : (stryCov_9fa48('382'), false),
                });
          }
        }
      }
    }

    // Default system prompt
    const prompt = promptService.render(
      stryMutAct_9fa48('383') ? '' : (stryCov_9fa48('383'), 'generateSmartResponse'),
      stryMutAct_9fa48('384')
        ? {}
        : (stryCov_9fa48('384'),
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
      if (stryMutAct_9fa48('385')) {
        {
        }
      } else {
        stryCov_9fa48('385');
        const response = await withRetry(
          stryMutAct_9fa48('386')
            ? () => undefined
            : (stryCov_9fa48('386'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('387')
                    ? {}
                    : (stryCov_9fa48('387'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('388')
                          ? []
                          : (stryCov_9fa48('388'),
                            [
                              stryMutAct_9fa48('389')
                                ? {}
                                : (stryCov_9fa48('389'),
                                  {
                                    role: stryMutAct_9fa48('390')
                                      ? ''
                                      : (stryCov_9fa48('390'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                      })
                ))
        );
        const parsed = parseLLMResponse(response.content);
        if (
          stryMutAct_9fa48('393')
            ? false
            : stryMutAct_9fa48('392')
              ? true
              : stryMutAct_9fa48('391')
                ? parsed
                : (stryCov_9fa48('391', '392', '393'), !parsed)
        ) {
          if (stryMutAct_9fa48('394')) {
            {
            }
          } else {
            stryCov_9fa48('394');
            info(
              stryMutAct_9fa48('395')
                ? ''
                : (stryCov_9fa48('395'), 'Failed to parse LLM response, using fallback')
            );
            return stryMutAct_9fa48('396')
              ? {}
              : (stryCov_9fa48('396'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('397') ? '' : (stryCov_9fa48('397'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('398')
                    ? false
                    : (stryCov_9fa48('398'), true),
                  shouldEndInterview: stryMutAct_9fa48('399')
                    ? true
                    : (stryCov_9fa48('399'), false),
                });
          }
        }
        if (
          stryMutAct_9fa48('402')
            ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
            : stryMutAct_9fa48('401')
              ? false
              : stryMutAct_9fa48('400')
                ? true
                : (stryCov_9fa48('400', '401', '402'),
                  (stryMutAct_9fa48('404')
                    ? parsed.action !== 'FOLLOWUP'
                    : stryMutAct_9fa48('403')
                      ? true
                      : (stryCov_9fa48('403', '404'),
                        parsed.action ===
                          (stryMutAct_9fa48('405') ? '' : (stryCov_9fa48('405'), 'FOLLOWUP')))) &&
                    (stryMutAct_9fa48('408')
                      ? state.followupCount < state.maxFollowups
                      : stryMutAct_9fa48('407')
                        ? state.followupCount > state.maxFollowups
                        : stryMutAct_9fa48('406')
                          ? true
                          : (stryCov_9fa48('406', '407', '408'),
                            state.followupCount >= state.maxFollowups)))
        ) {
          if (stryMutAct_9fa48('409')) {
            {
            }
          } else {
            stryCov_9fa48('409');
            info(
              stryMutAct_9fa48('410')
                ? ''
                : (stryCov_9fa48('410'), 'Followup limit exceeded, forcing NEXT')
            );
            return stryMutAct_9fa48('411')
              ? {}
              : (stryCov_9fa48('411'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: stryMutAct_9fa48('412') ? '' : (stryCov_9fa48('412'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('413')
                    ? false
                    : (stryCov_9fa48('413'), true),
                  shouldEndInterview: stryMutAct_9fa48('414')
                    ? true
                    : (stryCov_9fa48('414'), false),
                });
          }
        }
        return stryMutAct_9fa48('415')
          ? {}
          : (stryCov_9fa48('415'),
            {
              response: smartTruncate(parsed.response, 150),
              action: parsed.action,
              shouldProceedToNext: stryMutAct_9fa48('418')
                ? parsed.action !== 'NEXT'
                : stryMutAct_9fa48('417')
                  ? false
                  : stryMutAct_9fa48('416')
                    ? true
                    : (stryCov_9fa48('416', '417', '418'),
                      parsed.action ===
                        (stryMutAct_9fa48('419') ? '' : (stryCov_9fa48('419'), 'NEXT'))),
              shouldEndInterview: stryMutAct_9fa48('422')
                ? parsed.action !== 'END'
                : stryMutAct_9fa48('421')
                  ? false
                  : stryMutAct_9fa48('420')
                    ? true
                    : (stryCov_9fa48('420', '421', '422'),
                      parsed.action ===
                        (stryMutAct_9fa48('423') ? '' : (stryCov_9fa48('423'), 'END'))),
            });
      }
    } catch (error) {
      if (stryMutAct_9fa48('424')) {
        {
        }
      } else {
        stryCov_9fa48('424');
        const errMsg =
          error instanceof Error
            ? error.message
            : stryMutAct_9fa48('425')
              ? ''
              : (stryCov_9fa48('425'), 'Unknown error');
        info(
          stryMutAct_9fa48('426') ? '' : (stryCov_9fa48('426'), 'Smart response generation failed'),
          stryMutAct_9fa48('427')
            ? {}
            : (stryCov_9fa48('427'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('428')
          ? {}
          : (stryCov_9fa48('428'),
            {
              response: FALLBACK_RESPONSE,
              action: stryMutAct_9fa48('429') ? '' : (stryCov_9fa48('429'), 'NEXT'),
              shouldProceedToNext: stryMutAct_9fa48('430') ? false : (stryCov_9fa48('430'), true),
              shouldEndInterview: stryMutAct_9fa48('431') ? true : (stryCov_9fa48('431'), false),
            });
      }
    }
  }
}
