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
export const FALLBACK_RESPONSE = stryMutAct_9fa48('2936')
  ? ''
  : (stryCov_9fa48('2936'), '感谢您的回答，我们继续下一个话题。');
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  if (stryMutAct_9fa48('2937')) {
    {
    }
  } else {
    stryCov_9fa48('2937');
    let content = stryMutAct_9fa48('2938')
      ? rawContent
      : (stryCov_9fa48('2938'), rawContent.trim());
    const jsonMatch = content.match(
      stryMutAct_9fa48('2945')
        ? /```(?:json)?\s*([\s\s]*?)```/
        : stryMutAct_9fa48('2944')
          ? /```(?:json)?\s*([\S\S]*?)```/
          : stryMutAct_9fa48('2943')
            ? /```(?:json)?\s*([^\s\S]*?)```/
            : stryMutAct_9fa48('2942')
              ? /```(?:json)?\s*([\s\S])```/
              : stryMutAct_9fa48('2941')
                ? /```(?:json)?\S*([\s\S]*?)```/
                : stryMutAct_9fa48('2940')
                  ? /```(?:json)?\s([\s\S]*?)```/
                  : stryMutAct_9fa48('2939')
                    ? /```(?:json)\s*([\s\S]*?)```/
                    : (stryCov_9fa48('2939', '2940', '2941', '2942', '2943', '2944', '2945'),
                      /```(?:json)?\s*([\s\S]*?)```/)
    );
    if (
      stryMutAct_9fa48('2947')
        ? false
        : stryMutAct_9fa48('2946')
          ? true
          : (stryCov_9fa48('2946', '2947'), jsonMatch)
    ) {
      if (stryMutAct_9fa48('2948')) {
        {
        }
      } else {
        stryCov_9fa48('2948');
        content = stryMutAct_9fa48('2949')
          ? jsonMatch[1]
          : (stryCov_9fa48('2949'), jsonMatch[1].trim());
      }
    }
    try {
      if (stryMutAct_9fa48('2950')) {
        {
        }
      } else {
        stryCov_9fa48('2950');
        const parsed = JSON.parse(content);
        if (
          stryMutAct_9fa48('2953')
            ? !parsed.action && !parsed.response
            : stryMutAct_9fa48('2952')
              ? false
              : stryMutAct_9fa48('2951')
                ? true
                : (stryCov_9fa48('2951', '2952', '2953'),
                  (stryMutAct_9fa48('2954')
                    ? parsed.action
                    : (stryCov_9fa48('2954'), !parsed.action)) ||
                    (stryMutAct_9fa48('2955')
                      ? parsed.response
                      : (stryCov_9fa48('2955'), !parsed.response)))
        )
          return null;
        const validActions = stryMutAct_9fa48('2956')
          ? []
          : (stryCov_9fa48('2956'),
            [
              stryMutAct_9fa48('2957') ? '' : (stryCov_9fa48('2957'), 'NEXT'),
              stryMutAct_9fa48('2958') ? '' : (stryCov_9fa48('2958'), 'FOLLOWUP'),
              stryMutAct_9fa48('2959') ? '' : (stryCov_9fa48('2959'), 'END'),
              stryMutAct_9fa48('2960') ? '' : (stryCov_9fa48('2960'), 'STAY'),
            ]);
        const action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY' = validActions.includes(parsed.action)
          ? parsed.action
          : stryMutAct_9fa48('2961')
            ? ''
            : (stryCov_9fa48('2961'), 'STAY');
        return stryMutAct_9fa48('2962')
          ? {}
          : (stryCov_9fa48('2962'),
            {
              thinking: stryMutAct_9fa48('2965')
                ? parsed.thinking && ''
                : stryMutAct_9fa48('2964')
                  ? false
                  : stryMutAct_9fa48('2963')
                    ? true
                    : (stryCov_9fa48('2963', '2964', '2965'),
                      parsed.thinking ||
                        (stryMutAct_9fa48('2966')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('2966'), ''))),
              strategy: stryMutAct_9fa48('2969')
                ? parsed.strategy && 1
                : stryMutAct_9fa48('2968')
                  ? false
                  : stryMutAct_9fa48('2967')
                    ? true
                    : (stryCov_9fa48('2967', '2968', '2969'), parsed.strategy || 1),
              action,
              response: parsed.response,
            });
      }
    } catch {
      if (stryMutAct_9fa48('2970')) {
        {
        }
      } else {
        stryCov_9fa48('2970');
        return null;
      }
    }
  }
}
export function smartTruncate(text: string, maxLength: number): string {
  if (stryMutAct_9fa48('2971')) {
    {
    }
  } else {
    stryCov_9fa48('2971');
    if (
      stryMutAct_9fa48('2975')
        ? text.length > maxLength
        : stryMutAct_9fa48('2974')
          ? text.length < maxLength
          : stryMutAct_9fa48('2973')
            ? false
            : stryMutAct_9fa48('2972')
              ? true
              : (stryCov_9fa48('2972', '2973', '2974', '2975'), text.length <= maxLength)
    )
      return text;
    const threshold = Math.floor(
      stryMutAct_9fa48('2976') ? maxLength / 0.7 : (stryCov_9fa48('2976'), maxLength * 0.7)
    );
    const searchStart = stryMutAct_9fa48('2977')
      ? Math.max(threshold, maxLength - 10)
      : (stryCov_9fa48('2977'),
        Math.min(
          threshold,
          stryMutAct_9fa48('2978') ? maxLength + 10 : (stryCov_9fa48('2978'), maxLength - 10)
        ));
    const punctuations = stryMutAct_9fa48('2979')
      ? []
      : (stryCov_9fa48('2979'),
        [
          stryMutAct_9fa48('2980') ? '' : (stryCov_9fa48('2980'), '。'),
          stryMutAct_9fa48('2981') ? '' : (stryCov_9fa48('2981'), '！'),
          stryMutAct_9fa48('2982') ? '' : (stryCov_9fa48('2982'), '？'),
          stryMutAct_9fa48('2983') ? '' : (stryCov_9fa48('2983'), '.'),
          stryMutAct_9fa48('2984') ? '' : (stryCov_9fa48('2984'), '!'),
          stryMutAct_9fa48('2985') ? '' : (stryCov_9fa48('2985'), '?'),
        ]);
    let lastPunctuation = stryMutAct_9fa48('2986') ? +1 : (stryCov_9fa48('2986'), -1);
    for (const punct of punctuations) {
      if (stryMutAct_9fa48('2987')) {
        {
        }
      } else {
        stryCov_9fa48('2987');
        const idx = text.lastIndexOf(punct, maxLength);
        if (
          stryMutAct_9fa48('2990')
            ? idx > searchStart || idx > lastPunctuation
            : stryMutAct_9fa48('2989')
              ? false
              : stryMutAct_9fa48('2988')
                ? true
                : (stryCov_9fa48('2988', '2989', '2990'),
                  (stryMutAct_9fa48('2993')
                    ? idx <= searchStart
                    : stryMutAct_9fa48('2992')
                      ? idx >= searchStart
                      : stryMutAct_9fa48('2991')
                        ? true
                        : (stryCov_9fa48('2991', '2992', '2993'), idx > searchStart)) &&
                    (stryMutAct_9fa48('2996')
                      ? idx <= lastPunctuation
                      : stryMutAct_9fa48('2995')
                        ? idx >= lastPunctuation
                        : stryMutAct_9fa48('2994')
                          ? true
                          : (stryCov_9fa48('2994', '2995', '2996'), idx > lastPunctuation)))
        )
          lastPunctuation = idx;
      }
    }
    if (
      stryMutAct_9fa48('3000')
        ? lastPunctuation <= threshold
        : stryMutAct_9fa48('2999')
          ? lastPunctuation >= threshold
          : stryMutAct_9fa48('2998')
            ? false
            : stryMutAct_9fa48('2997')
              ? true
              : (stryCov_9fa48('2997', '2998', '2999', '3000'), lastPunctuation > threshold)
    )
      return stryMutAct_9fa48('3001')
        ? ``
        : (stryCov_9fa48('3001'),
          `${stryMutAct_9fa48('3002') ? text : (stryCov_9fa48('3002'), text.slice(0, stryMutAct_9fa48('3003') ? lastPunctuation - 1 : (stryCov_9fa48('3003'), lastPunctuation + 1)))}...`);
    return stryMutAct_9fa48('3004')
      ? ``
      : (stryCov_9fa48('3004'),
        `${stryMutAct_9fa48('3005') ? text : (stryCov_9fa48('3005'), text.slice(0, stryMutAct_9fa48('3006') ? maxLength + 3 : (stryCov_9fa48('3006'), maxLength - 3)))}...`);
  }
}
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  if (stryMutAct_9fa48('3007')) {
    {
    }
  } else {
    stryCov_9fa48('3007');
    const llm = VolcengineLLM.fromEnv();
    const conversationHistory = stryMutAct_9fa48('3008')
      ? state.messages
          .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
          .join('\n')
      : (stryCov_9fa48('3008'),
        state.messages
          .slice(stryMutAct_9fa48('3009') ? +6 : (stryCov_9fa48('3009'), -6))
          .map(
            stryMutAct_9fa48('3010')
              ? () => undefined
              : (stryCov_9fa48('3010'),
                (m) =>
                  stryMutAct_9fa48('3011')
                    ? ``
                    : (stryCov_9fa48('3011'),
                      `${(stryMutAct_9fa48('3014') ? m.role !== 'user' : stryMutAct_9fa48('3013') ? false : stryMutAct_9fa48('3012') ? true : (stryCov_9fa48('3012', '3013', '3014'), m.role === (stryMutAct_9fa48('3015') ? '' : (stryCov_9fa48('3015'), 'user')))) ? (stryMutAct_9fa48('3016') ? '' : (stryCov_9fa48('3016'), '用户')) : stryMutAct_9fa48('3017') ? '' : ((stryCov_9fa48('3017'), '主持人'))}: ${m.content}`))
          )
          .join(stryMutAct_9fa48('3018') ? '' : (stryCov_9fa48('3018'), '\n')));
    const userName = stryMutAct_9fa48('3021')
      ? state.userName && '受访者'
      : stryMutAct_9fa48('3020')
        ? false
        : stryMutAct_9fa48('3019')
          ? true
          : (stryCov_9fa48('3019', '3020', '3021'),
            state.userName || (stryMutAct_9fa48('3022') ? '' : (stryCov_9fa48('3022'), '受访者')));
    const lastQuestionFlag = isLastQuestion
      ? stryMutAct_9fa48('3023')
        ? ''
        : (stryCov_9fa48('3023'),
          '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n')
      : stryMutAct_9fa48('3024')
        ? 'Stryker was here!'
        : (stryCov_9fa48('3024'), '');
    if (
      stryMutAct_9fa48('3026')
        ? false
        : stryMutAct_9fa48('3025')
          ? true
          : (stryCov_9fa48('3025', '3026'), customPrompt)
    ) {
      if (stryMutAct_9fa48('3027')) {
        {
        }
      } else {
        stryCov_9fa48('3027');
        const prompt = customPrompt
          .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
          .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
          .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
          .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
          .replace(/\{\{userAnswer\}\}/g, userAnswer)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);
        try {
          if (stryMutAct_9fa48('3028')) {
            {
            }
          } else {
            stryCov_9fa48('3028');
            const response = await withRetry(
              stryMutAct_9fa48('3029')
                ? () => undefined
                : (stryCov_9fa48('3029'),
                  () =>
                    llm.chat(
                      stryMutAct_9fa48('3030')
                        ? {}
                        : (stryCov_9fa48('3030'),
                          {
                            model: DEFAULT_MODEL,
                            messages: stryMutAct_9fa48('3031')
                              ? []
                              : (stryCov_9fa48('3031'),
                                [
                                  stryMutAct_9fa48('3032')
                                    ? {}
                                    : (stryCov_9fa48('3032'),
                                      {
                                        role: stryMutAct_9fa48('3033')
                                          ? ''
                                          : (stryCov_9fa48('3033'), 'user'),
                                        content: prompt,
                                      }),
                                ]),
                          })
                    ))
            );
            const parsed = parseLLMResponse(response.content);
            if (
              stryMutAct_9fa48('3036')
                ? false
                : stryMutAct_9fa48('3035')
                  ? true
                  : stryMutAct_9fa48('3034')
                    ? parsed
                    : (stryCov_9fa48('3034', '3035', '3036'), !parsed)
            ) {
              if (stryMutAct_9fa48('3037')) {
                {
                }
              } else {
                stryCov_9fa48('3037');
                warn(
                  stryMutAct_9fa48('3038')
                    ? ''
                    : (stryCov_9fa48('3038'), 'Failed to parse custom prompt result, falling back')
                );
                return stryMutAct_9fa48('3039')
                  ? {}
                  : (stryCov_9fa48('3039'),
                    {
                      response: FALLBACK_RESPONSE,
                      action: stryMutAct_9fa48('3040') ? '' : (stryCov_9fa48('3040'), 'NEXT'),
                      shouldProceedToNext: stryMutAct_9fa48('3041')
                        ? false
                        : (stryCov_9fa48('3041'), true),
                      shouldEndInterview: stryMutAct_9fa48('3042')
                        ? true
                        : (stryCov_9fa48('3042'), false),
                    });
              }
            }
            if (
              stryMutAct_9fa48('3045')
                ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
                : stryMutAct_9fa48('3044')
                  ? false
                  : stryMutAct_9fa48('3043')
                    ? true
                    : (stryCov_9fa48('3043', '3044', '3045'),
                      (stryMutAct_9fa48('3047')
                        ? parsed.action !== 'FOLLOWUP'
                        : stryMutAct_9fa48('3046')
                          ? true
                          : (stryCov_9fa48('3046', '3047'),
                            parsed.action ===
                              (stryMutAct_9fa48('3048')
                                ? ''
                                : (stryCov_9fa48('3048'), 'FOLLOWUP')))) &&
                        (stryMutAct_9fa48('3051')
                          ? state.followupCount < state.maxFollowups
                          : stryMutAct_9fa48('3050')
                            ? state.followupCount > state.maxFollowups
                            : stryMutAct_9fa48('3049')
                              ? true
                              : (stryCov_9fa48('3049', '3050', '3051'),
                                state.followupCount >= state.maxFollowups)))
            )
              parsed.action = stryMutAct_9fa48('3052') ? '' : (stryCov_9fa48('3052'), 'NEXT');
            return stryMutAct_9fa48('3053')
              ? {}
              : (stryCov_9fa48('3053'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: parsed.action,
                  shouldProceedToNext: stryMutAct_9fa48('3056')
                    ? parsed.action !== 'NEXT'
                    : stryMutAct_9fa48('3055')
                      ? false
                      : stryMutAct_9fa48('3054')
                        ? true
                        : (stryCov_9fa48('3054', '3055', '3056'),
                          parsed.action ===
                            (stryMutAct_9fa48('3057') ? '' : (stryCov_9fa48('3057'), 'NEXT'))),
                  shouldEndInterview: stryMutAct_9fa48('3060')
                    ? parsed.action !== 'END'
                    : stryMutAct_9fa48('3059')
                      ? false
                      : stryMutAct_9fa48('3058')
                        ? true
                        : (stryCov_9fa48('3058', '3059', '3060'),
                          parsed.action ===
                            (stryMutAct_9fa48('3061') ? '' : (stryCov_9fa48('3061'), 'END'))),
                });
          }
        } catch {
          if (stryMutAct_9fa48('3062')) {
            {
            }
          } else {
            stryCov_9fa48('3062');
            warn(
              stryMutAct_9fa48('3063')
                ? ''
                : (stryCov_9fa48('3063'), 'Custom prompt LLM call failed')
            );
            return stryMutAct_9fa48('3064')
              ? {}
              : (stryCov_9fa48('3064'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('3065') ? '' : (stryCov_9fa48('3065'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('3066')
                    ? false
                    : (stryCov_9fa48('3066'), true),
                  shouldEndInterview: stryMutAct_9fa48('3067')
                    ? true
                    : (stryCov_9fa48('3067'), false),
                });
          }
        }
      }
    }

    // Default system prompt
    const prompt = promptService.render(
      stryMutAct_9fa48('3068') ? '' : (stryCov_9fa48('3068'), 'generateSmartResponse'),
      stryMutAct_9fa48('3069')
        ? {}
        : (stryCov_9fa48('3069'),
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
      if (stryMutAct_9fa48('3070')) {
        {
        }
      } else {
        stryCov_9fa48('3070');
        const response = await withRetry(
          stryMutAct_9fa48('3071')
            ? () => undefined
            : (stryCov_9fa48('3071'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('3072')
                    ? {}
                    : (stryCov_9fa48('3072'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('3073')
                          ? []
                          : (stryCov_9fa48('3073'),
                            [
                              stryMutAct_9fa48('3074')
                                ? {}
                                : (stryCov_9fa48('3074'),
                                  {
                                    role: stryMutAct_9fa48('3075')
                                      ? ''
                                      : (stryCov_9fa48('3075'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                      })
                ))
        );
        const parsed = parseLLMResponse(response.content);
        if (
          stryMutAct_9fa48('3078')
            ? false
            : stryMutAct_9fa48('3077')
              ? true
              : stryMutAct_9fa48('3076')
                ? parsed
                : (stryCov_9fa48('3076', '3077', '3078'), !parsed)
        ) {
          if (stryMutAct_9fa48('3079')) {
            {
            }
          } else {
            stryCov_9fa48('3079');
            info(
              stryMutAct_9fa48('3080')
                ? ''
                : (stryCov_9fa48('3080'), 'Failed to parse LLM response, using fallback')
            );
            return stryMutAct_9fa48('3081')
              ? {}
              : (stryCov_9fa48('3081'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('3082') ? '' : (stryCov_9fa48('3082'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('3083')
                    ? false
                    : (stryCov_9fa48('3083'), true),
                  shouldEndInterview: stryMutAct_9fa48('3084')
                    ? true
                    : (stryCov_9fa48('3084'), false),
                });
          }
        }
        if (
          stryMutAct_9fa48('3087')
            ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
            : stryMutAct_9fa48('3086')
              ? false
              : stryMutAct_9fa48('3085')
                ? true
                : (stryCov_9fa48('3085', '3086', '3087'),
                  (stryMutAct_9fa48('3089')
                    ? parsed.action !== 'FOLLOWUP'
                    : stryMutAct_9fa48('3088')
                      ? true
                      : (stryCov_9fa48('3088', '3089'),
                        parsed.action ===
                          (stryMutAct_9fa48('3090') ? '' : (stryCov_9fa48('3090'), 'FOLLOWUP')))) &&
                    (stryMutAct_9fa48('3093')
                      ? state.followupCount < state.maxFollowups
                      : stryMutAct_9fa48('3092')
                        ? state.followupCount > state.maxFollowups
                        : stryMutAct_9fa48('3091')
                          ? true
                          : (stryCov_9fa48('3091', '3092', '3093'),
                            state.followupCount >= state.maxFollowups)))
        ) {
          if (stryMutAct_9fa48('3094')) {
            {
            }
          } else {
            stryCov_9fa48('3094');
            info(
              stryMutAct_9fa48('3095')
                ? ''
                : (stryCov_9fa48('3095'), 'Followup limit exceeded, forcing NEXT')
            );
            return stryMutAct_9fa48('3096')
              ? {}
              : (stryCov_9fa48('3096'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: stryMutAct_9fa48('3097') ? '' : (stryCov_9fa48('3097'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('3098')
                    ? false
                    : (stryCov_9fa48('3098'), true),
                  shouldEndInterview: stryMutAct_9fa48('3099')
                    ? true
                    : (stryCov_9fa48('3099'), false),
                });
          }
        }
        return stryMutAct_9fa48('3100')
          ? {}
          : (stryCov_9fa48('3100'),
            {
              response: smartTruncate(parsed.response, 150),
              action: parsed.action,
              shouldProceedToNext: stryMutAct_9fa48('3103')
                ? parsed.action !== 'NEXT'
                : stryMutAct_9fa48('3102')
                  ? false
                  : stryMutAct_9fa48('3101')
                    ? true
                    : (stryCov_9fa48('3101', '3102', '3103'),
                      parsed.action ===
                        (stryMutAct_9fa48('3104') ? '' : (stryCov_9fa48('3104'), 'NEXT'))),
              shouldEndInterview: stryMutAct_9fa48('3107')
                ? parsed.action !== 'END'
                : stryMutAct_9fa48('3106')
                  ? false
                  : stryMutAct_9fa48('3105')
                    ? true
                    : (stryCov_9fa48('3105', '3106', '3107'),
                      parsed.action ===
                        (stryMutAct_9fa48('3108') ? '' : (stryCov_9fa48('3108'), 'END'))),
            });
      }
    } catch (error) {
      if (stryMutAct_9fa48('3109')) {
        {
        }
      } else {
        stryCov_9fa48('3109');
        const errMsg =
          error instanceof Error
            ? error.message
            : stryMutAct_9fa48('3110')
              ? ''
              : (stryCov_9fa48('3110'), 'Unknown error');
        info(
          stryMutAct_9fa48('3111')
            ? ''
            : (stryCov_9fa48('3111'), 'Smart response generation failed'),
          stryMutAct_9fa48('3112')
            ? {}
            : (stryCov_9fa48('3112'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('3113')
          ? {}
          : (stryCov_9fa48('3113'),
            {
              response: FALLBACK_RESPONSE,
              action: stryMutAct_9fa48('3114') ? '' : (stryCov_9fa48('3114'), 'NEXT'),
              shouldProceedToNext: stryMutAct_9fa48('3115') ? false : (stryCov_9fa48('3115'), true),
              shouldEndInterview: stryMutAct_9fa48('3116') ? true : (stryCov_9fa48('3116'), false),
            });
      }
    }
  }
}
