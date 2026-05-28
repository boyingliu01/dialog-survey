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
export const FALLBACK_RESPONSE = stryMutAct_9fa48('183')
  ? ''
  : (stryCov_9fa48('183'), '感谢您的回答，我们继续下一个话题。');
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  if (stryMutAct_9fa48('184')) {
    {
    }
  } else {
    stryCov_9fa48('184');
    let content = stryMutAct_9fa48('185') ? rawContent : (stryCov_9fa48('185'), rawContent.trim());
    const jsonMatch = content.match(
      stryMutAct_9fa48('192')
        ? /```(?:json)?\s*([\s\s]*?)```/
        : stryMutAct_9fa48('191')
          ? /```(?:json)?\s*([\S\S]*?)```/
          : stryMutAct_9fa48('190')
            ? /```(?:json)?\s*([^\s\S]*?)```/
            : stryMutAct_9fa48('189')
              ? /```(?:json)?\s*([\s\S])```/
              : stryMutAct_9fa48('188')
                ? /```(?:json)?\S*([\s\S]*?)```/
                : stryMutAct_9fa48('187')
                  ? /```(?:json)?\s([\s\S]*?)```/
                  : stryMutAct_9fa48('186')
                    ? /```(?:json)\s*([\s\S]*?)```/
                    : (stryCov_9fa48('186', '187', '188', '189', '190', '191', '192'),
                      /```(?:json)?\s*([\s\S]*?)```/)
    );
    if (
      stryMutAct_9fa48('194')
        ? false
        : stryMutAct_9fa48('193')
          ? true
          : (stryCov_9fa48('193', '194'), jsonMatch)
    ) {
      if (stryMutAct_9fa48('195')) {
        {
        }
      } else {
        stryCov_9fa48('195');
        content = stryMutAct_9fa48('196')
          ? jsonMatch[1]
          : (stryCov_9fa48('196'), jsonMatch[1].trim());
      }
    }
    try {
      if (stryMutAct_9fa48('197')) {
        {
        }
      } else {
        stryCov_9fa48('197');
        const parsed = JSON.parse(content);
        if (
          stryMutAct_9fa48('200')
            ? !parsed.action && !parsed.response
            : stryMutAct_9fa48('199')
              ? false
              : stryMutAct_9fa48('198')
                ? true
                : (stryCov_9fa48('198', '199', '200'),
                  (stryMutAct_9fa48('201')
                    ? parsed.action
                    : (stryCov_9fa48('201'), !parsed.action)) ||
                    (stryMutAct_9fa48('202')
                      ? parsed.response
                      : (stryCov_9fa48('202'), !parsed.response)))
        )
          return null;
        const validActions = stryMutAct_9fa48('203')
          ? []
          : (stryCov_9fa48('203'),
            [
              stryMutAct_9fa48('204') ? '' : (stryCov_9fa48('204'), 'NEXT'),
              stryMutAct_9fa48('205') ? '' : (stryCov_9fa48('205'), 'FOLLOWUP'),
              stryMutAct_9fa48('206') ? '' : (stryCov_9fa48('206'), 'END'),
              stryMutAct_9fa48('207') ? '' : (stryCov_9fa48('207'), 'STAY'),
            ]);
        const action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY' = validActions.includes(parsed.action)
          ? parsed.action
          : stryMutAct_9fa48('208')
            ? ''
            : (stryCov_9fa48('208'), 'STAY');
        return stryMutAct_9fa48('209')
          ? {}
          : (stryCov_9fa48('209'),
            {
              thinking: stryMutAct_9fa48('212')
                ? parsed.thinking && ''
                : stryMutAct_9fa48('211')
                  ? false
                  : stryMutAct_9fa48('210')
                    ? true
                    : (stryCov_9fa48('210', '211', '212'),
                      parsed.thinking ||
                        (stryMutAct_9fa48('213')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('213'), ''))),
              strategy: stryMutAct_9fa48('216')
                ? parsed.strategy && 1
                : stryMutAct_9fa48('215')
                  ? false
                  : stryMutAct_9fa48('214')
                    ? true
                    : (stryCov_9fa48('214', '215', '216'), parsed.strategy || 1),
              action,
              response: parsed.response,
            });
      }
    } catch {
      if (stryMutAct_9fa48('217')) {
        {
        }
      } else {
        stryCov_9fa48('217');
        return null;
      }
    }
  }
}
export function smartTruncate(text: string, maxLength: number): string {
  if (stryMutAct_9fa48('218')) {
    {
    }
  } else {
    stryCov_9fa48('218');
    if (
      stryMutAct_9fa48('222')
        ? text.length > maxLength
        : stryMutAct_9fa48('221')
          ? text.length < maxLength
          : stryMutAct_9fa48('220')
            ? false
            : stryMutAct_9fa48('219')
              ? true
              : (stryCov_9fa48('219', '220', '221', '222'), text.length <= maxLength)
    )
      return text;
    const threshold = Math.floor(
      stryMutAct_9fa48('223') ? maxLength / 0.7 : (stryCov_9fa48('223'), maxLength * 0.7)
    );
    const searchStart = stryMutAct_9fa48('224')
      ? Math.max(threshold, maxLength - 10)
      : (stryCov_9fa48('224'),
        Math.min(
          threshold,
          stryMutAct_9fa48('225') ? maxLength + 10 : (stryCov_9fa48('225'), maxLength - 10)
        ));
    const punctuations = stryMutAct_9fa48('226')
      ? []
      : (stryCov_9fa48('226'),
        [
          stryMutAct_9fa48('227') ? '' : (stryCov_9fa48('227'), '。'),
          stryMutAct_9fa48('228') ? '' : (stryCov_9fa48('228'), '！'),
          stryMutAct_9fa48('229') ? '' : (stryCov_9fa48('229'), '？'),
          stryMutAct_9fa48('230') ? '' : (stryCov_9fa48('230'), '.'),
          stryMutAct_9fa48('231') ? '' : (stryCov_9fa48('231'), '!'),
          stryMutAct_9fa48('232') ? '' : (stryCov_9fa48('232'), '?'),
        ]);
    let lastPunctuation = stryMutAct_9fa48('233') ? +1 : (stryCov_9fa48('233'), -1);
    for (const punct of punctuations) {
      if (stryMutAct_9fa48('234')) {
        {
        }
      } else {
        stryCov_9fa48('234');
        const idx = text.lastIndexOf(punct, maxLength);
        if (
          stryMutAct_9fa48('237')
            ? idx > searchStart || idx > lastPunctuation
            : stryMutAct_9fa48('236')
              ? false
              : stryMutAct_9fa48('235')
                ? true
                : (stryCov_9fa48('235', '236', '237'),
                  (stryMutAct_9fa48('240')
                    ? idx <= searchStart
                    : stryMutAct_9fa48('239')
                      ? idx >= searchStart
                      : stryMutAct_9fa48('238')
                        ? true
                        : (stryCov_9fa48('238', '239', '240'), idx > searchStart)) &&
                    (stryMutAct_9fa48('243')
                      ? idx <= lastPunctuation
                      : stryMutAct_9fa48('242')
                        ? idx >= lastPunctuation
                        : stryMutAct_9fa48('241')
                          ? true
                          : (stryCov_9fa48('241', '242', '243'), idx > lastPunctuation)))
        )
          lastPunctuation = idx;
      }
    }
    if (
      stryMutAct_9fa48('247')
        ? lastPunctuation <= threshold
        : stryMutAct_9fa48('246')
          ? lastPunctuation >= threshold
          : stryMutAct_9fa48('245')
            ? false
            : stryMutAct_9fa48('244')
              ? true
              : (stryCov_9fa48('244', '245', '246', '247'), lastPunctuation > threshold)
    )
      return stryMutAct_9fa48('248')
        ? ``
        : (stryCov_9fa48('248'),
          `${stryMutAct_9fa48('249') ? text : (stryCov_9fa48('249'), text.slice(0, stryMutAct_9fa48('250') ? lastPunctuation - 1 : (stryCov_9fa48('250'), lastPunctuation + 1)))}...`);
    return stryMutAct_9fa48('251')
      ? ``
      : (stryCov_9fa48('251'),
        `${stryMutAct_9fa48('252') ? text : (stryCov_9fa48('252'), text.slice(0, stryMutAct_9fa48('253') ? maxLength + 3 : (stryCov_9fa48('253'), maxLength - 3)))}...`);
  }
}
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  if (stryMutAct_9fa48('254')) {
    {
    }
  } else {
    stryCov_9fa48('254');
    const llm = VolcengineLLM.fromEnv();
    const conversationHistory = stryMutAct_9fa48('255')
      ? state.messages
          .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
          .join('\n')
      : (stryCov_9fa48('255'),
        state.messages
          .slice(stryMutAct_9fa48('256') ? +6 : (stryCov_9fa48('256'), -6))
          .map(
            stryMutAct_9fa48('257')
              ? () => undefined
              : (stryCov_9fa48('257'),
                (m) =>
                  stryMutAct_9fa48('258')
                    ? ``
                    : (stryCov_9fa48('258'),
                      `${(stryMutAct_9fa48('261') ? m.role !== 'user' : stryMutAct_9fa48('260') ? false : stryMutAct_9fa48('259') ? true : (stryCov_9fa48('259', '260', '261'), m.role === (stryMutAct_9fa48('262') ? '' : (stryCov_9fa48('262'), 'user')))) ? (stryMutAct_9fa48('263') ? '' : (stryCov_9fa48('263'), '用户')) : stryMutAct_9fa48('264') ? '' : ((stryCov_9fa48('264'), '主持人'))}: ${m.content}`))
          )
          .join(stryMutAct_9fa48('265') ? '' : (stryCov_9fa48('265'), '\n')));
    const userName = stryMutAct_9fa48('268')
      ? state.userName && '受访者'
      : stryMutAct_9fa48('267')
        ? false
        : stryMutAct_9fa48('266')
          ? true
          : (stryCov_9fa48('266', '267', '268'),
            state.userName || (stryMutAct_9fa48('269') ? '' : (stryCov_9fa48('269'), '受访者')));
    const lastQuestionFlag = isLastQuestion
      ? stryMutAct_9fa48('270')
        ? ''
        : (stryCov_9fa48('270'),
          '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n')
      : stryMutAct_9fa48('271')
        ? 'Stryker was here!'
        : (stryCov_9fa48('271'), '');
    if (
      stryMutAct_9fa48('273')
        ? false
        : stryMutAct_9fa48('272')
          ? true
          : (stryCov_9fa48('272', '273'), customPrompt)
    ) {
      if (stryMutAct_9fa48('274')) {
        {
        }
      } else {
        stryCov_9fa48('274');
        const prompt = customPrompt
          .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
          .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
          .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
          .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
          .replace(/\{\{userAnswer\}\}/g, userAnswer)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);
        try {
          if (stryMutAct_9fa48('275')) {
            {
            }
          } else {
            stryCov_9fa48('275');
            const response = await withRetry(
              stryMutAct_9fa48('276')
                ? () => undefined
                : (stryCov_9fa48('276'),
                  () =>
                    llm.chat(
                      stryMutAct_9fa48('277')
                        ? {}
                        : (stryCov_9fa48('277'),
                          {
                            model: DEFAULT_MODEL,
                            messages: stryMutAct_9fa48('278')
                              ? []
                              : (stryCov_9fa48('278'),
                                [
                                  stryMutAct_9fa48('279')
                                    ? {}
                                    : (stryCov_9fa48('279'),
                                      {
                                        role: stryMutAct_9fa48('280')
                                          ? ''
                                          : (stryCov_9fa48('280'), 'user'),
                                        content: prompt,
                                      }),
                                ]),
                          })
                    ))
            );
            const parsed = parseLLMResponse(response.content);
            if (
              stryMutAct_9fa48('283')
                ? false
                : stryMutAct_9fa48('282')
                  ? true
                  : stryMutAct_9fa48('281')
                    ? parsed
                    : (stryCov_9fa48('281', '282', '283'), !parsed)
            ) {
              if (stryMutAct_9fa48('284')) {
                {
                }
              } else {
                stryCov_9fa48('284');
                warn(
                  stryMutAct_9fa48('285')
                    ? ''
                    : (stryCov_9fa48('285'), 'Failed to parse custom prompt result, falling back')
                );
                return stryMutAct_9fa48('286')
                  ? {}
                  : (stryCov_9fa48('286'),
                    {
                      response: FALLBACK_RESPONSE,
                      action: stryMutAct_9fa48('287') ? '' : (stryCov_9fa48('287'), 'NEXT'),
                      shouldProceedToNext: stryMutAct_9fa48('288')
                        ? false
                        : (stryCov_9fa48('288'), true),
                      shouldEndInterview: stryMutAct_9fa48('289')
                        ? true
                        : (stryCov_9fa48('289'), false),
                    });
              }
            }
            if (
              stryMutAct_9fa48('292')
                ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
                : stryMutAct_9fa48('291')
                  ? false
                  : stryMutAct_9fa48('290')
                    ? true
                    : (stryCov_9fa48('290', '291', '292'),
                      (stryMutAct_9fa48('294')
                        ? parsed.action !== 'FOLLOWUP'
                        : stryMutAct_9fa48('293')
                          ? true
                          : (stryCov_9fa48('293', '294'),
                            parsed.action ===
                              (stryMutAct_9fa48('295')
                                ? ''
                                : (stryCov_9fa48('295'), 'FOLLOWUP')))) &&
                        (stryMutAct_9fa48('298')
                          ? state.followupCount < state.maxFollowups
                          : stryMutAct_9fa48('297')
                            ? state.followupCount > state.maxFollowups
                            : stryMutAct_9fa48('296')
                              ? true
                              : (stryCov_9fa48('296', '297', '298'),
                                state.followupCount >= state.maxFollowups)))
            )
              parsed.action = stryMutAct_9fa48('299') ? '' : (stryCov_9fa48('299'), 'NEXT');
            return stryMutAct_9fa48('300')
              ? {}
              : (stryCov_9fa48('300'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: parsed.action,
                  shouldProceedToNext: stryMutAct_9fa48('303')
                    ? parsed.action !== 'NEXT'
                    : stryMutAct_9fa48('302')
                      ? false
                      : stryMutAct_9fa48('301')
                        ? true
                        : (stryCov_9fa48('301', '302', '303'),
                          parsed.action ===
                            (stryMutAct_9fa48('304') ? '' : (stryCov_9fa48('304'), 'NEXT'))),
                  shouldEndInterview: stryMutAct_9fa48('307')
                    ? parsed.action !== 'END'
                    : stryMutAct_9fa48('306')
                      ? false
                      : stryMutAct_9fa48('305')
                        ? true
                        : (stryCov_9fa48('305', '306', '307'),
                          parsed.action ===
                            (stryMutAct_9fa48('308') ? '' : (stryCov_9fa48('308'), 'END'))),
                });
          }
        } catch {
          if (stryMutAct_9fa48('309')) {
            {
            }
          } else {
            stryCov_9fa48('309');
            warn(
              stryMutAct_9fa48('310') ? '' : (stryCov_9fa48('310'), 'Custom prompt LLM call failed')
            );
            return stryMutAct_9fa48('311')
              ? {}
              : (stryCov_9fa48('311'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('312') ? '' : (stryCov_9fa48('312'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('313')
                    ? false
                    : (stryCov_9fa48('313'), true),
                  shouldEndInterview: stryMutAct_9fa48('314')
                    ? true
                    : (stryCov_9fa48('314'), false),
                });
          }
        }
      }
    }

    // Default system prompt
    const prompt = promptService.render(
      stryMutAct_9fa48('315') ? '' : (stryCov_9fa48('315'), 'generateSmartResponse'),
      stryMutAct_9fa48('316')
        ? {}
        : (stryCov_9fa48('316'),
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
      if (stryMutAct_9fa48('317')) {
        {
        }
      } else {
        stryCov_9fa48('317');
        const response = await withRetry(
          stryMutAct_9fa48('318')
            ? () => undefined
            : (stryCov_9fa48('318'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('319')
                    ? {}
                    : (stryCov_9fa48('319'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('320')
                          ? []
                          : (stryCov_9fa48('320'),
                            [
                              stryMutAct_9fa48('321')
                                ? {}
                                : (stryCov_9fa48('321'),
                                  {
                                    role: stryMutAct_9fa48('322')
                                      ? ''
                                      : (stryCov_9fa48('322'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                      })
                ))
        );
        const parsed = parseLLMResponse(response.content);
        if (
          stryMutAct_9fa48('325')
            ? false
            : stryMutAct_9fa48('324')
              ? true
              : stryMutAct_9fa48('323')
                ? parsed
                : (stryCov_9fa48('323', '324', '325'), !parsed)
        ) {
          if (stryMutAct_9fa48('326')) {
            {
            }
          } else {
            stryCov_9fa48('326');
            info(
              stryMutAct_9fa48('327')
                ? ''
                : (stryCov_9fa48('327'), 'Failed to parse LLM response, using fallback')
            );
            return stryMutAct_9fa48('328')
              ? {}
              : (stryCov_9fa48('328'),
                {
                  response: FALLBACK_RESPONSE,
                  action: stryMutAct_9fa48('329') ? '' : (stryCov_9fa48('329'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('330')
                    ? false
                    : (stryCov_9fa48('330'), true),
                  shouldEndInterview: stryMutAct_9fa48('331')
                    ? true
                    : (stryCov_9fa48('331'), false),
                });
          }
        }
        if (
          stryMutAct_9fa48('334')
            ? parsed.action === 'FOLLOWUP' || state.followupCount >= state.maxFollowups
            : stryMutAct_9fa48('333')
              ? false
              : stryMutAct_9fa48('332')
                ? true
                : (stryCov_9fa48('332', '333', '334'),
                  (stryMutAct_9fa48('336')
                    ? parsed.action !== 'FOLLOWUP'
                    : stryMutAct_9fa48('335')
                      ? true
                      : (stryCov_9fa48('335', '336'),
                        parsed.action ===
                          (stryMutAct_9fa48('337') ? '' : (stryCov_9fa48('337'), 'FOLLOWUP')))) &&
                    (stryMutAct_9fa48('340')
                      ? state.followupCount < state.maxFollowups
                      : stryMutAct_9fa48('339')
                        ? state.followupCount > state.maxFollowups
                        : stryMutAct_9fa48('338')
                          ? true
                          : (stryCov_9fa48('338', '339', '340'),
                            state.followupCount >= state.maxFollowups)))
        ) {
          if (stryMutAct_9fa48('341')) {
            {
            }
          } else {
            stryCov_9fa48('341');
            info(
              stryMutAct_9fa48('342')
                ? ''
                : (stryCov_9fa48('342'), 'Followup limit exceeded, forcing NEXT')
            );
            return stryMutAct_9fa48('343')
              ? {}
              : (stryCov_9fa48('343'),
                {
                  response: smartTruncate(parsed.response, 150),
                  action: stryMutAct_9fa48('344') ? '' : (stryCov_9fa48('344'), 'NEXT'),
                  shouldProceedToNext: stryMutAct_9fa48('345')
                    ? false
                    : (stryCov_9fa48('345'), true),
                  shouldEndInterview: stryMutAct_9fa48('346')
                    ? true
                    : (stryCov_9fa48('346'), false),
                });
          }
        }
        return stryMutAct_9fa48('347')
          ? {}
          : (stryCov_9fa48('347'),
            {
              response: smartTruncate(parsed.response, 150),
              action: parsed.action,
              shouldProceedToNext: stryMutAct_9fa48('350')
                ? parsed.action !== 'NEXT'
                : stryMutAct_9fa48('349')
                  ? false
                  : stryMutAct_9fa48('348')
                    ? true
                    : (stryCov_9fa48('348', '349', '350'),
                      parsed.action ===
                        (stryMutAct_9fa48('351') ? '' : (stryCov_9fa48('351'), 'NEXT'))),
              shouldEndInterview: stryMutAct_9fa48('354')
                ? parsed.action !== 'END'
                : stryMutAct_9fa48('353')
                  ? false
                  : stryMutAct_9fa48('352')
                    ? true
                    : (stryCov_9fa48('352', '353', '354'),
                      parsed.action ===
                        (stryMutAct_9fa48('355') ? '' : (stryCov_9fa48('355'), 'END'))),
            });
      }
    } catch (error) {
      if (stryMutAct_9fa48('356')) {
        {
        }
      } else {
        stryCov_9fa48('356');
        const errMsg =
          error instanceof Error
            ? error.message
            : stryMutAct_9fa48('357')
              ? ''
              : (stryCov_9fa48('357'), 'Unknown error');
        info(
          stryMutAct_9fa48('358') ? '' : (stryCov_9fa48('358'), 'Smart response generation failed'),
          stryMutAct_9fa48('359')
            ? {}
            : (stryCov_9fa48('359'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('360')
          ? {}
          : (stryCov_9fa48('360'),
            {
              response: FALLBACK_RESPONSE,
              action: stryMutAct_9fa48('361') ? '' : (stryCov_9fa48('361'), 'NEXT'),
              shouldProceedToNext: stryMutAct_9fa48('362') ? false : (stryCov_9fa48('362'), true),
              shouldEndInterview: stryMutAct_9fa48('363') ? true : (stryCov_9fa48('363'), false),
            });
      }
    }
  }
}
