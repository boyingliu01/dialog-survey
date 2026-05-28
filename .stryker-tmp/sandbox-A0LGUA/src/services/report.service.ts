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
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, VolcengineLLM } from '../integrations/llm/volcengine.js';
import { info } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';
export interface Report {
  interviewId: string;
  content: string;
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
  generatedAt: Date;
}
export interface ReportWithDimensions extends Report {
  dimensionTags?: Array<{
    dimensionId: string;
    label: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    quotes: string[];
  }>;
  emergentTags?: string[];
  interviewerRating?: number;
}
export async function generateReport(
  interviewId: string,
  topic: string,
  qaPairs: Array<{
    question: string;
    answer: string;
  }>
): Promise<Report> {
  if (stryMutAct_9fa48('3357')) {
    {
    }
  } else {
    stryCov_9fa48('3357');
    info(
      stryMutAct_9fa48('3358') ? '' : (stryCov_9fa48('3358'), 'Generating report'),
      stryMutAct_9fa48('3359')
        ? {}
        : (stryCov_9fa48('3359'),
          {
            interviewId,
            qaCount: qaPairs.length,
          })
    );
    const qaText = qaPairs
      .map(
        stryMutAct_9fa48('3360')
          ? () => undefined
          : (stryCov_9fa48('3360'),
            (qa) =>
              stryMutAct_9fa48('3361')
                ? ``
                : (stryCov_9fa48('3361'), `Q: ${qa.question}\nA: ${qa.answer}`))
      )
      .join(stryMutAct_9fa48('3362') ? '' : (stryCov_9fa48('3362'), '\n\n'));
    const prompt = promptService.render(
      stryMutAct_9fa48('3363') ? '' : (stryCov_9fa48('3363'), 'generateReport'),
      stryMutAct_9fa48('3364')
        ? {}
        : (stryCov_9fa48('3364'),
          {
            topic,
            qaPairs: qaText,
          })
    );
    const llm = VolcengineLLM.fromEnv();
    try {
      if (stryMutAct_9fa48('3365')) {
        {
        }
      } else {
        stryCov_9fa48('3365');
        const response = await withRetry(
          stryMutAct_9fa48('3366')
            ? () => undefined
            : (stryCov_9fa48('3366'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('3367')
                    ? {}
                    : (stryCov_9fa48('3367'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('3368')
                          ? []
                          : (stryCov_9fa48('3368'),
                            [
                              stryMutAct_9fa48('3369')
                                ? {}
                                : (stryCov_9fa48('3369'),
                                  {
                                    role: stryMutAct_9fa48('3370')
                                      ? ''
                                      : (stryCov_9fa48('3370'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                        max_tokens: 3000,
                      })
                ))
        );
        const content = response.content;
        const parsed = parseReportContent(content);
        const report: Report = stryMutAct_9fa48('3371')
          ? {}
          : (stryCov_9fa48('3371'),
            {
              interviewId,
              content,
              keyFindings: parsed.keyFindings,
              sentiment: parsed.sentiment,
              recommendations: parsed.recommendations,
              generatedAt: new Date(),
            });
        await saveReport(report);
        return report;
      }
    } catch (e) {
      if (stryMutAct_9fa48('3372')) {
        {
        }
      } else {
        stryCov_9fa48('3372');
        const errorMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('3373')
              ? ''
              : (stryCov_9fa48('3373'), 'Unknown error');
        info(
          stryMutAct_9fa48('3374')
            ? ''
            : (stryCov_9fa48('3374'), 'Report generation failed, using fallback'),
          stryMutAct_9fa48('3375')
            ? {}
            : (stryCov_9fa48('3375'),
              {
                error: errorMsg,
              })
        );
        return createFallbackReport(interviewId, topic, qaPairs);
      }
    }
  }
}
function parseReportContent(content: string): {
  keyFindings: string[];
  sentiment: string;
  recommendations: string[];
} {
  if (stryMutAct_9fa48('3376')) {
    {
    }
  } else {
    stryCov_9fa48('3376');
    const keyFindings: string[] = stryMutAct_9fa48('3377')
      ? ['Stryker was here']
      : (stryCov_9fa48('3377'), []);
    let sentiment = stryMutAct_9fa48('3378') ? '' : (stryCov_9fa48('3378'), 'neutral');
    const recommendations: string[] = stryMutAct_9fa48('3379')
      ? ['Stryker was here']
      : (stryCov_9fa48('3379'), []);

    // Support both "### 1. 关键发现" (Markdown header) and "关键发现:" formats
    const findingMatch = stryMutAct_9fa48('3382')
      ? content.match(/[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i) &&
        content.match(/关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i)
      : stryMutAct_9fa48('3381')
        ? false
        : stryMutAct_9fa48('3380')
          ? true
          : (stryCov_9fa48('3380', '3381', '3382'),
            content.match(
              stryMutAct_9fa48('3397')
                ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .建议|$)/i
                : stryMutAct_9fa48('3396')
                  ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议)/i
                  : stryMutAct_9fa48('3395')
                    ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?!情感分析|行动建议|### .*建议|$)/i
                    : stryMutAct_9fa48('3394')
                      ? /[##\s]*关键发现[:：]?\s*\n?([\s\s]*?)(?=情感分析|行动建议|### .*建议|$)/i
                      : stryMutAct_9fa48('3393')
                        ? /[##\s]*关键发现[:：]?\s*\n?([\S\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                        : stryMutAct_9fa48('3392')
                          ? /[##\s]*关键发现[:：]?\s*\n?([^\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                          : stryMutAct_9fa48('3391')
                            ? /[##\s]*关键发现[:：]?\s*\n?([\s\S])(?=情感分析|行动建议|### .*建议|$)/i
                            : stryMutAct_9fa48('3390')
                              ? /[##\s]*关键发现[:：]?\s*\n([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                              : stryMutAct_9fa48('3389')
                                ? /[##\s]*关键发现[:：]?\S*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                : stryMutAct_9fa48('3388')
                                  ? /[##\s]*关键发现[:：]?\s\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                  : stryMutAct_9fa48('3387')
                                    ? /[##\s]*关键发现[^:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                    : stryMutAct_9fa48('3386')
                                      ? /[##\s]*关键发现[:：]\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                      : stryMutAct_9fa48('3385')
                                        ? /[##\S]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                        : stryMutAct_9fa48('3384')
                                          ? /[^##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                          : stryMutAct_9fa48('3383')
                                            ? /[##\s]关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                            : (stryCov_9fa48(
                                                '3383',
                                                '3384',
                                                '3385',
                                                '3386',
                                                '3387',
                                                '3388',
                                                '3389',
                                                '3390',
                                                '3391',
                                                '3392',
                                                '3393',
                                                '3394',
                                                '3395',
                                                '3396',
                                                '3397'
                                              ),
                                              /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('3406')
                  ? /关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议)/i
                  : stryMutAct_9fa48('3405')
                    ? /关键发现[\s:：]*([\s\S]*?)(?!情感分析|行动建议|$)/i
                    : stryMutAct_9fa48('3404')
                      ? /关键发现[\s:：]*([\s\s]*?)(?=情感分析|行动建议|$)/i
                      : stryMutAct_9fa48('3403')
                        ? /关键发现[\s:：]*([\S\S]*?)(?=情感分析|行动建议|$)/i
                        : stryMutAct_9fa48('3402')
                          ? /关键发现[\s:：]*([^\s\S]*?)(?=情感分析|行动建议|$)/i
                          : stryMutAct_9fa48('3401')
                            ? /关键发现[\s:：]*([\s\S])(?=情感分析|行动建议|$)/i
                            : stryMutAct_9fa48('3400')
                              ? /关键发现[\S:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i
                              : stryMutAct_9fa48('3399')
                                ? /关键发现[^\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i
                                : stryMutAct_9fa48('3398')
                                  ? /关键发现[\s:：]([\s\S]*?)(?=情感分析|行动建议|$)/i
                                  : (stryCov_9fa48(
                                      '3398',
                                      '3399',
                                      '3400',
                                      '3401',
                                      '3402',
                                      '3403',
                                      '3404',
                                      '3405',
                                      '3406'
                                    ),
                                    /关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i)
              ));
    if (
      stryMutAct_9fa48('3408')
        ? false
        : stryMutAct_9fa48('3407')
          ? true
          : (stryCov_9fa48('3407', '3408'), findingMatch)
    ) {
      if (stryMutAct_9fa48('3409')) {
        {
        }
      } else {
        stryCov_9fa48('3409');
        // Split by newlines or markdown list markers, filter out empty/heading lines
        const findings = stryMutAct_9fa48('3410')
          ? findingMatch[1].split(/[\n]+/).map((f) =>
              f
                .replace(/^[-*•]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
          : (stryCov_9fa48('3410'),
            findingMatch[1]
              .split(
                stryMutAct_9fa48('3412')
                  ? /[^\n]+/
                  : stryMutAct_9fa48('3411')
                    ? /[\n]/
                    : (stryCov_9fa48('3411', '3412'), /[\n]+/)
              )
              .map(
                stryMutAct_9fa48('3413')
                  ? () => undefined
                  : (stryCov_9fa48('3413'),
                    (f) =>
                      stryMutAct_9fa48('3414')
                        ? f.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '')
                        : (stryCov_9fa48('3414'),
                          f
                            .replace(
                              stryMutAct_9fa48('3418')
                                ? /^[-*•]\S*/
                                : stryMutAct_9fa48('3417')
                                  ? /^[-*•]\s/
                                  : stryMutAct_9fa48('3416')
                                    ? /^[^-*•]\s*/
                                    : stryMutAct_9fa48('3415')
                                      ? /[-*•]\s*/
                                      : (stryCov_9fa48('3415', '3416', '3417', '3418'),
                                        /^[-*•]\s*/),
                              stryMutAct_9fa48('3419')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('3419'), '')
                            )
                            .replace(
                              stryMutAct_9fa48('3424')
                                ? /^\d+\.\S*/
                                : stryMutAct_9fa48('3423')
                                  ? /^\d+\.\s/
                                  : stryMutAct_9fa48('3422')
                                    ? /^\D+\.\s*/
                                    : stryMutAct_9fa48('3421')
                                      ? /^\d\.\s*/
                                      : stryMutAct_9fa48('3420')
                                        ? /\d+\.\s*/
                                        : (stryCov_9fa48('3420', '3421', '3422', '3423', '3424'),
                                          /^\d+\.\s*/),
                              stryMutAct_9fa48('3425')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('3425'), '')
                            )
                            .trim()))
              )
              .filter(
                stryMutAct_9fa48('3426')
                  ? () => undefined
                  : (stryCov_9fa48('3426'),
                    (f) =>
                      stryMutAct_9fa48('3430')
                        ? f.length <= 0
                        : stryMutAct_9fa48('3429')
                          ? f.length >= 0
                          : stryMutAct_9fa48('3428')
                            ? false
                            : stryMutAct_9fa48('3427')
                              ? true
                              : (stryCov_9fa48('3427', '3428', '3429', '3430'), f.length > 0))
              ));
        keyFindings.push(
          ...(stryMutAct_9fa48('3431') ? findings : (stryCov_9fa48('3431'), findings.slice(0, 5)))
        );
      }
    }

    // Support both "### 2. 情感分析" and "情感分析:" formats
    const sentimentMatch = stryMutAct_9fa48('3434')
      ? content.match(/情感分析[:：]\s*([\u4e00-\u9fa5]+)/i) &&
        content.match(
          /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
        )
      : stryMutAct_9fa48('3433')
        ? false
        : stryMutAct_9fa48('3432')
          ? true
          : (stryCov_9fa48('3432', '3433', '3434'),
            content.match(
              stryMutAct_9fa48('3439')
                ? /情感分析[:：]\s*([^\u4e00-\u9fa5]+)/i
                : stryMutAct_9fa48('3438')
                  ? /情感分析[:：]\s*([\u4e00-\u9fa5])/i
                  : stryMutAct_9fa48('3437')
                    ? /情感分析[:：]\S*([\u4e00-\u9fa5]+)/i
                    : stryMutAct_9fa48('3436')
                      ? /情感分析[:：]\s([\u4e00-\u9fa5]+)/i
                      : stryMutAct_9fa48('3435')
                        ? /情感分析[^:：]\s*([\u4e00-\u9fa5]+)/i
                        : (stryCov_9fa48('3435', '3436', '3437', '3438', '3439'),
                          /情感分析[:：]\s*([\u4e00-\u9fa5]+)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('3443')
                  ? /情感分析[\s\s]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                  : stryMutAct_9fa48('3442')
                    ? /情感分析[\S\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                    : stryMutAct_9fa48('3441')
                      ? /情感分析[^\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                      : stryMutAct_9fa48('3440')
                        ? /情感分析[\s\S](积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                        : (stryCov_9fa48('3440', '3441', '3442', '3443'),
                          /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i)
              ));
    if (
      stryMutAct_9fa48('3445')
        ? false
        : stryMutAct_9fa48('3444')
          ? true
          : (stryCov_9fa48('3444', '3445'), sentimentMatch)
    ) {
      if (stryMutAct_9fa48('3446')) {
        {
        }
      } else {
        stryCov_9fa48('3446');
        const raw = stryMutAct_9fa48('3448')
          ? sentimentMatch[1].toLowerCase()
          : stryMutAct_9fa48('3447')
            ? sentimentMatch[1].trim().toUpperCase()
            : (stryCov_9fa48('3447', '3448'), sentimentMatch[1].trim().toLowerCase());
        if (
          stryMutAct_9fa48('3451')
            ? (raw.includes('积极') || raw.includes('正面')) && raw === 'positive'
            : stryMutAct_9fa48('3450')
              ? false
              : stryMutAct_9fa48('3449')
                ? true
                : (stryCov_9fa48('3449', '3450', '3451'),
                  (stryMutAct_9fa48('3453')
                    ? raw.includes('积极') && raw.includes('正面')
                    : stryMutAct_9fa48('3452')
                      ? false
                      : (stryCov_9fa48('3452', '3453'),
                        raw.includes(
                          stryMutAct_9fa48('3454') ? '' : (stryCov_9fa48('3454'), '积极')
                        ) ||
                          raw.includes(
                            stryMutAct_9fa48('3455') ? '' : (stryCov_9fa48('3455'), '正面')
                          ))) ||
                    (stryMutAct_9fa48('3457')
                      ? raw !== 'positive'
                      : stryMutAct_9fa48('3456')
                        ? false
                        : (stryCov_9fa48('3456', '3457'),
                          raw ===
                            (stryMutAct_9fa48('3458') ? '' : (stryCov_9fa48('3458'), 'positive')))))
        ) {
          if (stryMutAct_9fa48('3459')) {
            {
            }
          } else {
            stryCov_9fa48('3459');
            sentiment = stryMutAct_9fa48('3460') ? '' : (stryCov_9fa48('3460'), 'positive');
          }
        } else if (
          stryMutAct_9fa48('3463')
            ? (raw.includes('消极') || raw.includes('负面')) && raw === 'negative'
            : stryMutAct_9fa48('3462')
              ? false
              : stryMutAct_9fa48('3461')
                ? true
                : (stryCov_9fa48('3461', '3462', '3463'),
                  (stryMutAct_9fa48('3465')
                    ? raw.includes('消极') && raw.includes('负面')
                    : stryMutAct_9fa48('3464')
                      ? false
                      : (stryCov_9fa48('3464', '3465'),
                        raw.includes(
                          stryMutAct_9fa48('3466') ? '' : (stryCov_9fa48('3466'), '消极')
                        ) ||
                          raw.includes(
                            stryMutAct_9fa48('3467') ? '' : (stryCov_9fa48('3467'), '负面')
                          ))) ||
                    (stryMutAct_9fa48('3469')
                      ? raw !== 'negative'
                      : stryMutAct_9fa48('3468')
                        ? false
                        : (stryCov_9fa48('3468', '3469'),
                          raw ===
                            (stryMutAct_9fa48('3470') ? '' : (stryCov_9fa48('3470'), 'negative')))))
        ) {
          if (stryMutAct_9fa48('3471')) {
            {
            }
          } else {
            stryCov_9fa48('3471');
            sentiment = stryMutAct_9fa48('3472') ? '' : (stryCov_9fa48('3472'), 'negative');
          }
        } else {
          if (stryMutAct_9fa48('3473')) {
            {
            }
          } else {
            stryCov_9fa48('3473');
            sentiment = stryMutAct_9fa48('3474') ? '' : (stryCov_9fa48('3474'), 'neutral');
          }
        }
      }
    }

    // Support both "### 3. 行动建议" and "行动建议:" formats
    const recMatch = stryMutAct_9fa48('3477')
      ? content.match(/行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i) &&
        content.match(/行动建议[\s\S]*?([\s\S]*)/i)
      : stryMutAct_9fa48('3476')
        ? false
        : stryMutAct_9fa48('3475')
          ? true
          : (stryCov_9fa48('3475', '3476', '3477'),
            content.match(
              stryMutAct_9fa48('3488')
                ? /行动建议[:：]?\s*\n?([\s\S]*?)(?=总结)/i
                : stryMutAct_9fa48('3487')
                  ? /行动建议[:：]?\s*\n?([\s\S]*?)(?!总结|$)/i
                  : stryMutAct_9fa48('3486')
                    ? /行动建议[:：]?\s*\n?([\s\s]*?)(?=总结|$)/i
                    : stryMutAct_9fa48('3485')
                      ? /行动建议[:：]?\s*\n?([\S\S]*?)(?=总结|$)/i
                      : stryMutAct_9fa48('3484')
                        ? /行动建议[:：]?\s*\n?([^\s\S]*?)(?=总结|$)/i
                        : stryMutAct_9fa48('3483')
                          ? /行动建议[:：]?\s*\n?([\s\S])(?=总结|$)/i
                          : stryMutAct_9fa48('3482')
                            ? /行动建议[:：]?\s*\n([\s\S]*?)(?=总结|$)/i
                            : stryMutAct_9fa48('3481')
                              ? /行动建议[:：]?\S*\n?([\s\S]*?)(?=总结|$)/i
                              : stryMutAct_9fa48('3480')
                                ? /行动建议[:：]?\s\n?([\s\S]*?)(?=总结|$)/i
                                : stryMutAct_9fa48('3479')
                                  ? /行动建议[^:：]?\s*\n?([\s\S]*?)(?=总结|$)/i
                                  : stryMutAct_9fa48('3478')
                                    ? /行动建议[:：]\s*\n?([\s\S]*?)(?=总结|$)/i
                                    : (stryCov_9fa48(
                                        '3478',
                                        '3479',
                                        '3480',
                                        '3481',
                                        '3482',
                                        '3483',
                                        '3484',
                                        '3485',
                                        '3486',
                                        '3487',
                                        '3488'
                                      ),
                                      /行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('3496')
                  ? /行动建议[\s\S]*?([\s\s]*)/i
                  : stryMutAct_9fa48('3495')
                    ? /行动建议[\s\S]*?([\S\S]*)/i
                    : stryMutAct_9fa48('3494')
                      ? /行动建议[\s\S]*?([^\s\S]*)/i
                      : stryMutAct_9fa48('3493')
                        ? /行动建议[\s\S]*?([\s\S])/i
                        : stryMutAct_9fa48('3492')
                          ? /行动建议[\s\s]*?([\s\S]*)/i
                          : stryMutAct_9fa48('3491')
                            ? /行动建议[\S\S]*?([\s\S]*)/i
                            : stryMutAct_9fa48('3490')
                              ? /行动建议[^\s\S]*?([\s\S]*)/i
                              : stryMutAct_9fa48('3489')
                                ? /行动建议[\s\S]([\s\S]*)/i
                                : (stryCov_9fa48(
                                    '3489',
                                    '3490',
                                    '3491',
                                    '3492',
                                    '3493',
                                    '3494',
                                    '3495',
                                    '3496'
                                  ),
                                  /行动建议[\s\S]*?([\s\S]*)/i)
              ));
    if (
      stryMutAct_9fa48('3498')
        ? false
        : stryMutAct_9fa48('3497')
          ? true
          : (stryCov_9fa48('3497', '3498'), recMatch)
    ) {
      if (stryMutAct_9fa48('3499')) {
        {
        }
      } else {
        stryCov_9fa48('3499');
        const recs = stryMutAct_9fa48('3500')
          ? recMatch[1].split(/[\n]+/).map((r) =>
              r
                .replace(/^[-*•]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
          : (stryCov_9fa48('3500'),
            recMatch[1]
              .split(
                stryMutAct_9fa48('3502')
                  ? /[^\n]+/
                  : stryMutAct_9fa48('3501')
                    ? /[\n]/
                    : (stryCov_9fa48('3501', '3502'), /[\n]+/)
              )
              .map(
                stryMutAct_9fa48('3503')
                  ? () => undefined
                  : (stryCov_9fa48('3503'),
                    (r) =>
                      stryMutAct_9fa48('3504')
                        ? r.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '')
                        : (stryCov_9fa48('3504'),
                          r
                            .replace(
                              stryMutAct_9fa48('3508')
                                ? /^[-*•]\S*/
                                : stryMutAct_9fa48('3507')
                                  ? /^[-*•]\s/
                                  : stryMutAct_9fa48('3506')
                                    ? /^[^-*•]\s*/
                                    : stryMutAct_9fa48('3505')
                                      ? /[-*•]\s*/
                                      : (stryCov_9fa48('3505', '3506', '3507', '3508'),
                                        /^[-*•]\s*/),
                              stryMutAct_9fa48('3509')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('3509'), '')
                            )
                            .replace(
                              stryMutAct_9fa48('3514')
                                ? /^\d+\.\S*/
                                : stryMutAct_9fa48('3513')
                                  ? /^\d+\.\s/
                                  : stryMutAct_9fa48('3512')
                                    ? /^\D+\.\s*/
                                    : stryMutAct_9fa48('3511')
                                      ? /^\d\.\s*/
                                      : stryMutAct_9fa48('3510')
                                        ? /\d+\.\s*/
                                        : (stryCov_9fa48('3510', '3511', '3512', '3513', '3514'),
                                          /^\d+\.\s*/),
                              stryMutAct_9fa48('3515')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('3515'), '')
                            )
                            .trim()))
              )
              .filter(
                stryMutAct_9fa48('3516')
                  ? () => undefined
                  : (stryCov_9fa48('3516'),
                    (r) =>
                      stryMutAct_9fa48('3520')
                        ? r.length <= 0
                        : stryMutAct_9fa48('3519')
                          ? r.length >= 0
                          : stryMutAct_9fa48('3518')
                            ? false
                            : stryMutAct_9fa48('3517')
                              ? true
                              : (stryCov_9fa48('3517', '3518', '3519', '3520'), r.length > 0))
              ));
        recommendations.push(
          ...(stryMutAct_9fa48('3521') ? recs : (stryCov_9fa48('3521'), recs.slice(0, 5)))
        );
      }
    }
    return stryMutAct_9fa48('3522')
      ? {}
      : (stryCov_9fa48('3522'),
        {
          keyFindings,
          sentiment,
          recommendations,
        });
  }
}
function createFallbackReport(
  interviewId: string,
  topic: string,
  qaPairs: Array<{
    question: string;
    answer: string;
  }>
): Report {
  if (stryMutAct_9fa48('3523')) {
    {
    }
  } else {
    stryCov_9fa48('3523');
    return stryMutAct_9fa48('3524')
      ? {}
      : (stryCov_9fa48('3524'),
        {
          interviewId,
          content: stryMutAct_9fa48('3525')
            ? ``
            : (stryCov_9fa48('3525'),
              `# 访谈报告\n\n主题: ${topic}\n\n问答记录:\n${qaPairs.map(stryMutAct_9fa48('3526') ? () => undefined : (stryCov_9fa48('3526'), (qa) => (stryMutAct_9fa48('3527') ? `` : (stryCov_9fa48('3527'), `Q: ${qa.question}\nA: ${qa.answer}`)))).join(stryMutAct_9fa48('3528') ? '' : (stryCov_9fa48('3528'), '\n\n'))}`),
          keyFindings: qaPairs.map(
            stryMutAct_9fa48('3529')
              ? () => undefined
              : (stryCov_9fa48('3529'),
                (qa) =>
                  stryMutAct_9fa48('3530')
                    ? qa.answer
                    : (stryCov_9fa48('3530'), qa.answer.substring(0, 50)))
          ),
          sentiment: stryMutAct_9fa48('3531') ? '' : (stryCov_9fa48('3531'), 'neutral'),
          recommendations: stryMutAct_9fa48('3532')
            ? []
            : (stryCov_9fa48('3532'),
              [
                stryMutAct_9fa48('3533') ? '' : (stryCov_9fa48('3533'), '建议进行更深入的后续访谈'),
              ]),
          generatedAt: new Date(),
        });
  }
}
async function saveReport(report: Report): Promise<string> {
  if (stryMutAct_9fa48('3534')) {
    {
    }
  } else {
    stryCov_9fa48('3534');
    const reportsDir = stryMutAct_9fa48('3537')
      ? process.env.REPORTS_DIR && './reports'
      : stryMutAct_9fa48('3536')
        ? false
        : stryMutAct_9fa48('3535')
          ? true
          : (stryCov_9fa48('3535', '3536', '3537'),
            process.env.REPORTS_DIR ||
              (stryMutAct_9fa48('3538') ? '' : (stryCov_9fa48('3538'), './reports')));
    const filename = stryMutAct_9fa48('3539')
      ? ``
      : (stryCov_9fa48('3539'), `${report.interviewId}_${Date.now()}.md`);
    const filepath = path.join(reportsDir, filename);
    fs.mkdirSync(
      reportsDir,
      stryMutAct_9fa48('3540')
        ? {}
        : (stryCov_9fa48('3540'),
          {
            recursive: stryMutAct_9fa48('3541') ? false : (stryCov_9fa48('3541'), true),
          })
    );
    fs.writeFileSync(filepath, report.content);
    info(
      stryMutAct_9fa48('3542') ? '' : (stryCov_9fa48('3542'), 'Report saved'),
      stryMutAct_9fa48('3543')
        ? {}
        : (stryCov_9fa48('3543'),
          {
            filepath,
          })
    );
    return filepath;
  }
}
export async function generateReportWithDimensions(
  interviewId: string,
  _topic: string,
  qaPairs: Array<{
    question: string;
    answer: string;
  }>,
  dimensionsJson: string | null,
  llm: VolcengineLLM
): Promise<ReportWithDimensions> {
  if (stryMutAct_9fa48('3544')) {
    {
    }
  } else {
    stryCov_9fa48('3544');
    const qaText = qaPairs
      .map(
        stryMutAct_9fa48('3545')
          ? () => undefined
          : (stryCov_9fa48('3545'),
            (qa) =>
              stryMutAct_9fa48('3546')
                ? ``
                : (stryCov_9fa48('3546'), `Q: ${qa.question}\nA: ${qa.answer}`))
      )
      .join(stryMutAct_9fa48('3547') ? '' : (stryCov_9fa48('3547'), '\n\n'));
    const prompt = promptService.render(
      stryMutAct_9fa48('3548') ? '' : (stryCov_9fa48('3548'), 'analyzeWithDimensions'),
      stryMutAct_9fa48('3549')
        ? {}
        : (stryCov_9fa48('3549'),
          {
            dimensions: stryMutAct_9fa48('3552')
              ? dimensionsJson && '[No preset dimensions]'
              : stryMutAct_9fa48('3551')
                ? false
                : stryMutAct_9fa48('3550')
                  ? true
                  : (stryCov_9fa48('3550', '3551', '3552'),
                    dimensionsJson ||
                      (stryMutAct_9fa48('3553')
                        ? ''
                        : (stryCov_9fa48('3553'), '[No preset dimensions]'))),
            qaPairs: qaText,
          })
    );
    try {
      if (stryMutAct_9fa48('3554')) {
        {
        }
      } else {
        stryCov_9fa48('3554');
        const response = await withRetry(
          stryMutAct_9fa48('3555')
            ? () => undefined
            : (stryCov_9fa48('3555'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('3556')
                    ? {}
                    : (stryCov_9fa48('3556'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('3557')
                          ? []
                          : (stryCov_9fa48('3557'),
                            [
                              stryMutAct_9fa48('3558')
                                ? {}
                                : (stryCov_9fa48('3558'),
                                  {
                                    role: stryMutAct_9fa48('3559')
                                      ? ''
                                      : (stryCov_9fa48('3559'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                        max_tokens: 2000,
                        temperature: 0.1,
                      })
                ))
        );
        const parsed = parseDimensionAnalysis(response.content);
        return stryMutAct_9fa48('3560')
          ? {}
          : (stryCov_9fa48('3560'),
            {
              interviewId,
              content: response.content,
              keyFindings: stryMutAct_9fa48('3561')
                ? ['Stryker was here']
                : (stryCov_9fa48('3561'), []),
              sentiment: stryMutAct_9fa48('3562')
                ? 'Stryker was here!'
                : (stryCov_9fa48('3562'), ''),
              recommendations: stryMutAct_9fa48('3563')
                ? ['Stryker was here']
                : (stryCov_9fa48('3563'), []),
              generatedAt: new Date(),
              ...parsed,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('3564')) {
        {
        }
      } else {
        stryCov_9fa48('3564');
        info(
          stryMutAct_9fa48('3565') ? '' : (stryCov_9fa48('3565'), 'Dimension analysis failed'),
          stryMutAct_9fa48('3566')
            ? {}
            : (stryCov_9fa48('3566'),
              {
                interviewId,
                error: (e as Error).message,
              })
        );
        return stryMutAct_9fa48('3567')
          ? {}
          : (stryCov_9fa48('3567'),
            {
              interviewId,
              content: stryMutAct_9fa48('3568') ? 'Stryker was here!' : (stryCov_9fa48('3568'), ''),
              keyFindings: stryMutAct_9fa48('3569')
                ? ['Stryker was here']
                : (stryCov_9fa48('3569'), []),
              sentiment: stryMutAct_9fa48('3570')
                ? 'Stryker was here!'
                : (stryCov_9fa48('3570'), ''),
              recommendations: stryMutAct_9fa48('3571')
                ? ['Stryker was here']
                : (stryCov_9fa48('3571'), []),
              generatedAt: new Date(),
              dimensionTags: stryMutAct_9fa48('3572')
                ? ['Stryker was here']
                : (stryCov_9fa48('3572'), []),
              emergentTags: stryMutAct_9fa48('3573')
                ? ['Stryker was here']
                : (stryCov_9fa48('3573'), []),
            });
      }
    }
  }
}
function parseDimensionAnalysis(
  content: string
): Pick<ReportWithDimensions, 'dimensionTags' | 'emergentTags' | 'interviewerRating'> {
  if (stryMutAct_9fa48('3574')) {
    {
    }
  } else {
    stryCov_9fa48('3574');
    try {
      if (stryMutAct_9fa48('3575')) {
        {
        }
      } else {
        stryCov_9fa48('3575');
        const cleaned = stryMutAct_9fa48('3576')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('3576'),
            content
              .replace(
                stryMutAct_9fa48('3577') ? /```json\n/g : (stryCov_9fa48('3577'), /```json\n?/g),
                stryMutAct_9fa48('3578') ? 'Stryker was here!' : (stryCov_9fa48('3578'), '')
              )
              .replace(
                stryMutAct_9fa48('3579') ? /```\n/g : (stryCov_9fa48('3579'), /```\n?/g),
                stryMutAct_9fa48('3580') ? 'Stryker was here!' : (stryCov_9fa48('3580'), '')
              )
              .trim());
        const jsonRaw = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('3583')
            ? typeof jsonRaw !== 'object' && jsonRaw === null
            : stryMutAct_9fa48('3582')
              ? false
              : stryMutAct_9fa48('3581')
                ? true
                : (stryCov_9fa48('3581', '3582', '3583'),
                  (stryMutAct_9fa48('3585')
                    ? typeof jsonRaw === 'object'
                    : stryMutAct_9fa48('3584')
                      ? false
                      : (stryCov_9fa48('3584', '3585'),
                        typeof jsonRaw !==
                          (stryMutAct_9fa48('3586') ? '' : (stryCov_9fa48('3586'), 'object')))) ||
                    (stryMutAct_9fa48('3588')
                      ? jsonRaw !== null
                      : stryMutAct_9fa48('3587')
                        ? false
                        : (stryCov_9fa48('3587', '3588'), jsonRaw === null)))
        ) {
          if (stryMutAct_9fa48('3589')) {
            {
            }
          } else {
            stryCov_9fa48('3589');
            return stryMutAct_9fa48('3590')
              ? {}
              : (stryCov_9fa48('3590'),
                {
                  dimensionTags: stryMutAct_9fa48('3591')
                    ? ['Stryker was here']
                    : (stryCov_9fa48('3591'), []),
                  emergentTags: stryMutAct_9fa48('3592')
                    ? ['Stryker was here']
                    : (stryCov_9fa48('3592'), []),
                });
          }
        }
        const jsonStr = jsonRaw as Record<string, unknown>;
        return stryMutAct_9fa48('3593')
          ? {}
          : (stryCov_9fa48('3593'),
            {
              dimensionTags: Array.isArray(jsonStr.dimensionTags)
                ? jsonStr.dimensionTags
                : stryMutAct_9fa48('3594')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3594'), []),
              emergentTags: Array.isArray(jsonStr.emergentTags)
                ? jsonStr.emergentTags
                : stryMutAct_9fa48('3595')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3595'), []),
              interviewerRating: (
                stryMutAct_9fa48('3598')
                  ? typeof jsonStr.interviewerRating !== 'number'
                  : stryMutAct_9fa48('3597')
                    ? false
                    : stryMutAct_9fa48('3596')
                      ? true
                      : (stryCov_9fa48('3596', '3597', '3598'),
                        typeof jsonStr.interviewerRating ===
                          (stryMutAct_9fa48('3599') ? '' : (stryCov_9fa48('3599'), 'number')))
              )
                ? jsonStr.interviewerRating
                : undefined,
            });
      }
    } catch {
      if (stryMutAct_9fa48('3600')) {
        {
        }
      } else {
        stryCov_9fa48('3600');
        return stryMutAct_9fa48('3601')
          ? {}
          : (stryCov_9fa48('3601'),
            {
              dimensionTags: stryMutAct_9fa48('3602')
                ? ['Stryker was here']
                : (stryCov_9fa48('3602'), []),
              emergentTags: stryMutAct_9fa48('3603')
                ? ['Stryker was here']
                : (stryCov_9fa48('3603'), []),
            });
      }
    }
  }
}
