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
export const FALLBACK_RESPONSE = stryMutAct_9fa48('91')
  ? ''
  : (stryCov_9fa48('91'), '感谢您的回答，我们继续下一个话题。');
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  if (stryMutAct_9fa48('92')) {
    {
    }
  } else {
    stryCov_9fa48('92');
    let content = stryMutAct_9fa48('93') ? rawContent : (stryCov_9fa48('93'), rawContent.trim());
    const jsonMatch = content.match(
      stryMutAct_9fa48('100')
        ? /```(?:json)?\s*([\s\s]*?)```/
        : stryMutAct_9fa48('99')
          ? /```(?:json)?\s*([\S\S]*?)```/
          : stryMutAct_9fa48('98')
            ? /```(?:json)?\s*([^\s\S]*?)```/
            : stryMutAct_9fa48('97')
              ? /```(?:json)?\s*([\s\S])```/
              : stryMutAct_9fa48('96')
                ? /```(?:json)?\S*([\s\S]*?)```/
                : stryMutAct_9fa48('95')
                  ? /```(?:json)?\s([\s\S]*?)```/
                  : stryMutAct_9fa48('94')
                    ? /```(?:json)\s*([\s\S]*?)```/
                    : (stryCov_9fa48('94', '95', '96', '97', '98', '99', '100'),
                      /```(?:json)?\s*([\s\S]*?)```/)
    );
    if (
      stryMutAct_9fa48('102')
        ? false
        : stryMutAct_9fa48('101')
          ? true
          : (stryCov_9fa48('101', '102'), jsonMatch)
    ) {
      if (stryMutAct_9fa48('103')) {
        {
        }
      } else {
        stryCov_9fa48('103');
        content = stryMutAct_9fa48('104')
          ? jsonMatch[1]
          : (stryCov_9fa48('104'), jsonMatch[1].trim());
      }
    }
    try {
      if (stryMutAct_9fa48('105')) {
        {
        }
      } else {
        stryCov_9fa48('105');
        const parsed = JSON.parse(content);
        if (
          stryMutAct_9fa48('108')
            ? !parsed.action && !parsed.response
            : stryMutAct_9fa48('107')
              ? false
              : stryMutAct_9fa48('106')
                ? true
                : (stryCov_9fa48('106', '107', '108'),
                  (stryMutAct_9fa48('109')
                    ? parsed.action
                    : (stryCov_9fa48('109'), !parsed.action)) ||
                    (stryMutAct_9fa48('110')
                      ? parsed.response
                      : (stryCov_9fa48('110'), !parsed.response)))
        )
          return null;
        const validActions = stryMutAct_9fa48('111')
          ? []
          : (stryCov_9fa48('111'),
            [
              stryMutAct_9fa48('112') ? '' : (stryCov_9fa48('112'), 'NEXT'),
              stryMutAct_9fa48('113') ? '' : (stryCov_9fa48('113'), 'FOLLOWUP'),
              stryMutAct_9fa48('114') ? '' : (stryCov_9fa48('114'), 'END'),
              stryMutAct_9fa48('115') ? '' : (stryCov_9fa48('115'), 'STAY'),
            ]);
        const action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY' = validActions.includes(parsed.action)
          ? parsed.action
          : stryMutAct_9fa48('116')
            ? ''
            : (stryCov_9fa48('116'), 'STAY');
        return stryMutAct_9fa48('117')
          ? {}
          : (stryCov_9fa48('117'),
            {
              thinking: stryMutAct_9fa48('120')
                ? parsed.thinking && ''
                : stryMutAct_9fa48('119')
                  ? false
                  : stryMutAct_9fa48('118')
                    ? true
                    : (stryCov_9fa48('118', '119', '120'),
                      parsed.thinking ||
                        (stryMutAct_9fa48('121')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('121'), ''))),
              strategy: stryMutAct_9fa48('124')
                ? parsed.strategy && 1
                : stryMutAct_9fa48('123')
                  ? false
                  : stryMutAct_9fa48('122')
                    ? true
                    : (stryCov_9fa48('122', '123', '124'), parsed.strategy || 1),
              action,
              response: parsed.response,
            });
      }
    } catch {
      if (stryMutAct_9fa48('125')) {
        {
        }
      } else {
        stryCov_9fa48('125');
        return null;
      }
    }
  }
}
export function smartTruncate(text: string, maxLength: number): string {
  if (stryMutAct_9fa48('126')) {
    {
    }
  } else {
    stryCov_9fa48('126');
    if (
      stryMutAct_9fa48('130')
        ? text.length > maxLength
        : stryMutAct_9fa48('129')
          ? text.length < maxLength
          : stryMutAct_9fa48('128')
            ? false
            : stryMutAct_9fa48('127')
              ? true
              : (stryCov_9fa48('127', '128', '129', '130'), text.length <= maxLength)
    )
      return text;
    const threshold = Math.floor(
      stryMutAct_9fa48('131') ? maxLength / 0.7 : (stryCov_9fa48('131'), maxLength * 0.7)
    );
    const searchStart = stryMutAct_9fa48('132')
      ? Math.max(threshold, maxLength - 10)
      : (stryCov_9fa48('132'),
        Math.min(
          threshold,
          stryMutAct_9fa48('133') ? maxLength + 10 : (stryCov_9fa48('133'), maxLength - 10)
        ));
    const punctuations = stryMutAct_9fa48('134')
      ? []
      : (stryCov_9fa48('134'),
        [
          stryMutAct_9fa48('135') ? '' : (stryCov_9fa48('135'), '。'),
          stryMutAct_9fa48('136') ? '' : (stryCov_9fa48('136'), '！'),
          stryMutAct_9fa48('137') ? '' : (stryCov_9fa48('137'), '？'),
          stryMutAct_9fa48('138') ? '' : (stryCov_9fa48('138'), '.'),
          stryMutAct_9fa48('139') ? '' : (stryCov_9fa48('139'), '!'),
          stryMutAct_9fa48('140') ? '' : (stryCov_9fa48('140'), '?'),
        ]);
    let lastPunctuation = stryMutAct_9fa48('141') ? +1 : (stryCov_9fa48('141'), -1);
    for (const punct of punctuations) {
      if (stryMutAct_9fa48('142')) {
        {
        }
      } else {
        stryCov_9fa48('142');
        const idx = text.lastIndexOf(punct, maxLength);
        if (
          stryMutAct_9fa48('145')
            ? idx > searchStart || idx > lastPunctuation
            : stryMutAct_9fa48('144')
              ? false
              : stryMutAct_9fa48('143')
                ? true
                : (stryCov_9fa48('143', '144', '145'),
                  (stryMutAct_9fa48('148')
                    ? idx <= searchStart
                    : stryMutAct_9fa48('147')
                      ? idx >= searchStart
                      : stryMutAct_9fa48('146')
                        ? true
                        : (stryCov_9fa48('146', '147', '148'), idx > searchStart)) &&
                    (stryMutAct_9fa48('151')
                      ? idx <= lastPunctuation
                      : stryMutAct_9fa48('150')
                        ? idx >= lastPunctuation
                        : stryMutAct_9fa48('149')
                          ? true
                          : (stryCov_9fa48('149', '150', '151'), idx > lastPunctuation)))
        )
          lastPunctuation = idx;
      }
    }
    if (
      stryMutAct_9fa48('155')
        ? lastPunctuation <= threshold
        : stryMutAct_9fa48('154')
          ? lastPunctuation >= threshold
          : stryMutAct_9fa48('153')
            ? false
            : stryMutAct_9fa48('152')
              ? true
              : (stryCov_9fa48('152', '153', '154', '155'), lastPunctuation > threshold)
    )
      return stryMutAct_9fa48('156')
        ? ``
        : (stryCov_9fa48('156'),
          `${stryMutAct_9fa48('157') ? text : (stryCov_9fa48('157'), text.slice(0, stryMutAct_9fa48('158') ? lastPunctuation - 1 : (stryCov_9fa48('158'), lastPunctuation + 1)))}...`);
    return stryMutAct_9fa48('159')
      ? ``
      : (stryCov_9fa48('159'),
        `${stryMutAct_9fa48('160') ? text : (stryCov_9fa48('160'), text.slice(0, stryMutAct_9fa48('161') ? maxLength + 3 : (stryCov_9fa48('161'), maxLength - 3)))}...`);
  }
}
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  if (stryMutAct_9fa48('162')) {
    {
    }
  } else {
    stryCov_9fa48('162');
    const llm = VolcengineLLM.fromEnv();
    const conversationHistory = stryMutAct_9fa48('163')
      ? state.messages
          .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
          .join('\n')
      : (stryCov_9fa48('163'),
        state.messages
          .slice(stryMutAct_9fa48('164') ? +6 : (stryCov_9fa48('164'), -6))
          .map(
            stryMutAct_9fa48('165')
              ? () => undefined
              : (stryCov_9fa48('165'),
                (m) =>
                  stryMutAct_9fa48('166')
                    ? ``
                    : (stryCov_9fa48('166'),
                      `${(stryMutAct_9fa48('169') ? m.role !== 'user' : stryMutAct_9fa48('168') ? false : stryMutAct_9fa48('167') ? true : (stryCov_9fa48('167', '168', '169'), m.role === (stryMutAct_9fa48('170') ? '' : (stryCov_9fa48('170'), 'user')))) ? (stryMutAct_9fa48('171') ? '' : (stryCov_9fa48('171'), '用户')) : stryMutAct_9fa48('172') ? '' : ((stryCov_9fa48('172'), '主持人'))}: ${m.content}`))
          )
          .join(stryMutAct_9fa48('173') ? '' : (stryCov_9fa48('173'), '\n')));
    const userName = stryMutAct_9fa48('176')
      ? state.userName && '受访者'
      : stryMutAct_9fa48('175')
        ? false
        : stryMutAct_9fa48('174')
          ? true
          : (stryCov_9fa48('174', '175', '176'),
            state.userName || (stryMutAct_9fa48('177') ? '' : (stryCov_9fa48('177'), '受访者')));
    const lastQuestionFlag = isLastQuestion
      ? stryMutAct_9fa48('178')
        ? ''
        : (stryCov_9fa48('178'),
          '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n')
      : stryMutAct_9fa48('179')
        ? 'Stryker was here!'
        : (stryCov_9fa48('179'), '');
    if (
      stryMutAct_9fa48('181')
        ? false
        : stryMutAct_9fa48('180')
          ? true
          : (stryCov_9fa48('180', '181'), customPrompt)
    ) {
      if (stryMutAct_9fa48('182')) {
        {
        }
      } else {
        stryCov_9fa48('182');
        const prompt = customPrompt
          .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
          .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
          .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
          .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
          .replace(/\{\{userAnswer\}\}/g, userAnswer)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);
        try {
          if (stryMutAct_9fa48('183')) {
            {
            }
          } else {
            stryCov_9fa48('183');
            const response = await withRetry(
              stryMutAct_9fa48('184')
                ? () => undefined
                : (stryCov_9fa48('184'),
                  () =>
                    llm.chat(
                      stryMutAct_9fa48('185')
                        ? {}
                        : (stryCov_9fa48('185'),
                          {
                            model: DEFAULT_MODEL,
                            messages: stryMutAct_9fa48('186')
                              ? []
                              : (stryCov_9fa48('186'),
                                [
                                  stryMutAct_9fa48('187')
                                    ? {}
                                    : (stryCov_9fa48('187'),
                                      {
                                        role: stryMutAct_9fa48('188')
                                          ? ''
                                          : (stryCov_9fa48('188'), 'user'),
                                        content: prompt,
                                      }),
                                ]),
                          })
                    ))
            );
            const parsed = parseLLMResponse(response.content);
            if (
              stryMutAct_9fa48('191')
                ? false
                : stryMutAct_9fa48('190')
                  ? true
                  : stryMutAct_9fa48('189')
                    ? parsed
                    : (stryCov_9fa48('189', '190', '191'), !parsed)
            ) {
              if (stryMutAct_9fa48('192')) {
                {
                }
              } else {
                stryCov_9fa48('192');
                warn(
                  stryMutAct_9fa48('193')
                    ? ''
                    : (stryCov_9fa48('193'), 'Failed to parse custom prompt result, falling back')
                );
                return stryMutAct_9fa48('194')
                  ? {}
                  : (stryCov_9fa48('194'),
                    {
                      response: FALLBACK_RESPONSE,
                      action: stryMutAct_9fa48('195') ? '' : (stryCov_9fa48('195'), 'NEXT'),
                      shouldProceedToNext: stryMutAct_9fa48('196')
                        ? false
                        : (stryCov_9fa48('196'), true),
                      shouldEndInterview: stryMutAct_9fa48('197')
                        ? true
                        : (stryCov_9fa48('197'), false),
                    });
              }
            }
            if (
              stryMutAct_9fa48('200')
                ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
                : stryMutAct_9fa48('199')
                  ? false
                  : stryMutAct_9fa48('198')
                    ? true
                    : (stryCov_9fa48('198', '199', '200'),
                      (stryMutAct_9fa48('202')
                        ? parsed.action !== 'FOLLOWUP'
                        : stryMutAct_9fa48('201')
                          ? true
                          : (stryCov_9fa48('201', '202'),
                            parsed.action ===
                              (stryMutAct_9fa48('203')
                                ? ''
                                : (stryCov_9fa48('203'), 'FOLLOWUP')))) &&
                        (stryMutAct_9fa48('206')
                          ? state.followupCount < state.maxFollowups
                          : stryMutAct_9fa48('205')
                            ? state.followupCount > state.maxFollowups
                            : stryMutAct_9fa48('204')
                              ? true
                              : (stryCov_9fa48('204', '205', '206'),
                                state.followupCount >= state.maxFollowups)))
            )
              parsed.action = stryMutAct_9fa48('207') ? '' : (stryCov_9fa48('207'), 'NEXT');
            return stryMutAct_9fa48('208')
              ? {}
              : (stryCov_9fa48('208'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: parsed.action,
                  shouldProceedToNext: stryMutAct_9fa48('211')
                    ? parsed.action !== 'NEXT'
                    : stryMutAct_9fa48('210')
                      ? false
                      : stryMutAct_9fa48('209')
                        ? true
                        : (stryCov_9fa48('209', '210', '211'),
                          parsed.action ===
                            (stryMutAct_9fa48('212') ? '' : (stryCov_9fa48('212'), 'NEXT'))),
                  shouldEndInterview: stryMutAct_9fa48('215')
                    ? parsed.action !== 'END'
                    : stryMutAct_9fa48('214')
                      ? false
                      : stryMutAct_9fa48('213')
                        ? true
                        : (stryCov_9fa48('213', '214', '215'),
                          parsed.action ===
                            (stryMutAct_9fa48('216') ? '' : (stryCov_9fa48('216'), 'END'))),
                });
          }
        } catch {
          if (stryMutAct_9fa48('217')) {
            {
            }
          } else {
            stryCov_9fa48('217');
            warn(
              stryMutAct_9fa48('218') ? '' : (stryCov_9fa48('218'), 'Custom prompt LLM call failed')
            );
            return stryMutAct_9fa48('219')
              ? {}
              : (stryCov_9fa48('219'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('220') ? '' : (stryCov_9fa48('220'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('221')
                    ? false
                    : (stryCov_9fa48('221'), true),
                  shouldEndInterview: stryMutAct_9fa48('222')
                    ? true
                    : (stryCov_9fa48('222'), false),
                });
          }
        }
      }
    }

    // Default system prompt
    const prompt = promptService.render(
      stryMutAct_9fa48('223') ? '' : (stryCov_9fa48('223'), 'generateSmartResponse'),
      stryMutAct_9fa48('224')
        ? {}
        : (stryCov_9fa48('224'),
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
      if (stryMutAct_9fa48('225')) {
        {
        }
      } else {
        stryCov_9fa48('225');
        const response = await withRetry(
          stryMutAct_9fa48('226')
            ? () => undefined
            : (stryCov_9fa48('226'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('227')
                    ? {}
                    : (stryCov_9fa48('227'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('228')
                          ? []
                          : (stryCov_9fa48('228'),
                            [
                              stryMutAct_9fa48('229')
                                ? {}
                                : (stryCov_9fa48('229'),
                                  {
                                    role: stryMutAct_9fa48('230')
                                      ? ''
                                      : (stryCov_9fa48('230'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                      })
                ))
        );
        const parsed = parseLLMResponse(response.content);
        if (
          stryMutAct_9fa48('233')
            ? false
            : stryMutAct_9fa48('232')
              ? true
              : stryMutAct_9fa48('231')
                ? parsed
                : (stryCov_9fa48('231', '232', '233'), !parsed)
        ) {
          if (stryMutAct_9fa48('234')) {
            {
            }
          } else {
            stryCov_9fa48('234');
            info(
              stryMutAct_9fa48('235')
                ? ''
                : (stryCov_9fa48('235'), 'Failed to parse LLM response, using fallback')
            );
            return stryMutAct_9fa48('236')
              ? {}
              : (stryCov_9fa48('236'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('237') ? '' : (stryCov_9fa48('237'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('238')
                    ? false
                    : (stryCov_9fa48('238'), true),
                  shouldEndInterview: stryMutAct_9fa48('239')
                    ? true
                    : (stryCov_9fa48('239'), false),
                });
          }
        }
        if (
          stryMutAct_9fa48('242')
            ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
            : stryMutAct_9fa48('241')
              ? false
              : stryMutAct_9fa48('240')
                ? true
                : (stryCov_9fa48('240', '241', '242'),
                  (stryMutAct_9fa48('244')
                    ? parsed.action !== 'FOLLOWUP'
                    : stryMutAct_9fa48('243')
                      ? true
                      : (stryCov_9fa48('243', '244'),
                        parsed.action ===
                          (stryMutAct_9fa48('245') ? '' : (stryCov_9fa48('245'), 'FOLLOWUP')))) &&
                    (stryMutAct_9fa48('248')
                      ? state.followupCount < state.maxFollowups
                      : stryMutAct_9fa48('247')
                        ? state.followupCount > state.maxFollowups
                        : stryMutAct_9fa48('246')
                          ? true
                          : (stryCov_9fa48('246', '247', '248'),
                            state.followupCount >= state.maxFollowups)))
        ) {
          if (stryMutAct_9fa48('249')) {
            {
            }
          } else {
            stryCov_9fa48('249');
            info(
              stryMutAct_9fa48('250')
                ? ''
                : (stryCov_9fa48('250'), 'Followup limit exceeded, forcing NEXT')
            );
            return stryMutAct_9fa48('251')
              ? {}
              : (stryCov_9fa48('251'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: stryMutAct_9fa48('252') ? '' : (stryCov_9fa48('252'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('253')
                    ? false
                    : (stryCov_9fa48('253'), true),
                  shouldEndInterview: stryMutAct_9fa48('254')
                    ? true
                    : (stryCov_9fa48('254'), false),
                });
          }
        }
        return stryMutAct_9fa48('255')
          ? {}
          : (stryCov_9fa48('255'),
            {
              response: smartTruncate(parsed.response, 150),
              action: parsed.action,
              shouldProceedToNext: stryMutAct_9fa48('258')
                ? parsed.action !== 'NEXT'
                : stryMutAct_9fa48('257')
                  ? false
                  : stryMutAct_9fa48('256')
                    ? true
                    : (stryCov_9fa48('256', '257', '258'),
                      parsed.action ===
                        (stryMutAct_9fa48('259') ? '' : (stryCov_9fa48('259'), 'NEXT'))),
              shouldEndInterview: stryMutAct_9fa48('262')
                ? parsed.action !== 'END'
                : stryMutAct_9fa48('261')
                  ? false
                  : stryMutAct_9fa48('260')
                    ? true
                    : (stryCov_9fa48('260', '261', '262'),
                      parsed.action ===
                        (stryMutAct_9fa48('263') ? '' : (stryCov_9fa48('263'), 'END'))),
            });
      }
    } catch (error) {
      if (stryMutAct_9fa48('264')) {
        {
        }
      } else {
        stryCov_9fa48('264');
        const errMsg =
          error instanceof Error
            ? error.message
            : stryMutAct_9fa48('265')
              ? ''
              : (stryCov_9fa48('265'), 'Unknown error');
        info(
          stryMutAct_9fa48('266') ? '' : (stryCov_9fa48('266'), 'Smart response generation failed'),
          stryMutAct_9fa48('267')
            ? {}
            : (stryCov_9fa48('267'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('268')
          ? {}
          : (stryCov_9fa48('268'),
            {
              response: FALLBACK_RESPONSE,
              action: stryMutAct_9fa48('269') ? '' : (stryCov_9fa48('269'), 'NEXT'),
              shouldProceedToNext: stryMutAct_9fa48('270') ? false : (stryCov_9fa48('270'), true),
              shouldEndInterview: stryMutAct_9fa48('271') ? true : (stryCov_9fa48('271'), false),
            });
      }
    }
  }
}
