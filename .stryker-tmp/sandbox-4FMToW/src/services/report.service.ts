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
  if (stryMutAct_9fa48('551')) {
    {
    }
  } else {
    stryCov_9fa48('551');
    info(
      stryMutAct_9fa48('552') ? '' : (stryCov_9fa48('552'), 'Generating report'),
      stryMutAct_9fa48('553')
        ? {}
        : (stryCov_9fa48('553'),
          {
            interviewId,
            qaCount: qaPairs.length,
          })
    );
    const qaText = qaPairs
      .map(
        stryMutAct_9fa48('554')
          ? () => undefined
          : (stryCov_9fa48('554'),
            (qa) =>
              stryMutAct_9fa48('555')
                ? ``
                : (stryCov_9fa48('555'), `Q: ${qa.question}\nA: ${qa.answer}`))
      )
      .join(stryMutAct_9fa48('556') ? '' : (stryCov_9fa48('556'), '\n\n'));
    const prompt = promptService.render(
      stryMutAct_9fa48('557') ? '' : (stryCov_9fa48('557'), 'generateReport'),
      stryMutAct_9fa48('558')
        ? {}
        : (stryCov_9fa48('558'),
          {
            topic,
            qaPairs: qaText,
          })
    );
    const llm = VolcengineLLM.fromEnv();
    try {
      if (stryMutAct_9fa48('559')) {
        {
        }
      } else {
        stryCov_9fa48('559');
        const response = await withRetry(
          stryMutAct_9fa48('560')
            ? () => undefined
            : (stryCov_9fa48('560'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('561')
                    ? {}
                    : (stryCov_9fa48('561'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('562')
                          ? []
                          : (stryCov_9fa48('562'),
                            [
                              stryMutAct_9fa48('563')
                                ? {}
                                : (stryCov_9fa48('563'),
                                  {
                                    role: stryMutAct_9fa48('564')
                                      ? ''
                                      : (stryCov_9fa48('564'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                        max_tokens: 3000,
                      })
                ))
        );
        const content = response.content;
        const parsed = parseReportContent(content);
        const report: Report = stryMutAct_9fa48('565')
          ? {}
          : (stryCov_9fa48('565'),
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
      if (stryMutAct_9fa48('566')) {
        {
        }
      } else {
        stryCov_9fa48('566');
        const errorMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('567')
              ? ''
              : (stryCov_9fa48('567'), 'Unknown error');
        info(
          stryMutAct_9fa48('568')
            ? ''
            : (stryCov_9fa48('568'), 'Report generation failed, using fallback'),
          stryMutAct_9fa48('569')
            ? {}
            : (stryCov_9fa48('569'),
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
  if (stryMutAct_9fa48('570')) {
    {
    }
  } else {
    stryCov_9fa48('570');
    const keyFindings: string[] = stryMutAct_9fa48('571')
      ? ['Stryker was here']
      : (stryCov_9fa48('571'), []);
    let sentiment = stryMutAct_9fa48('572') ? '' : (stryCov_9fa48('572'), 'neutral');
    const recommendations: string[] = stryMutAct_9fa48('573')
      ? ['Stryker was here']
      : (stryCov_9fa48('573'), []);

    // Support both "### 1. 关键发现" (Markdown header) and "关键发现:" formats
    const findingMatch = stryMutAct_9fa48('576')
      ? content.match(/[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i) &&
        content.match(/关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i)
      : stryMutAct_9fa48('575')
        ? false
        : stryMutAct_9fa48('574')
          ? true
          : (stryCov_9fa48('574', '575', '576'),
            content.match(
              stryMutAct_9fa48('591')
                ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .建议|$)/i
                : stryMutAct_9fa48('590')
                  ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议)/i
                  : stryMutAct_9fa48('589')
                    ? /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?!情感分析|行动建议|### .*建议|$)/i
                    : stryMutAct_9fa48('588')
                      ? /[##\s]*关键发现[:：]?\s*\n?([\s\s]*?)(?=情感分析|行动建议|### .*建议|$)/i
                      : stryMutAct_9fa48('587')
                        ? /[##\s]*关键发现[:：]?\s*\n?([\S\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                        : stryMutAct_9fa48('586')
                          ? /[##\s]*关键发现[:：]?\s*\n?([^\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                          : stryMutAct_9fa48('585')
                            ? /[##\s]*关键发现[:：]?\s*\n?([\s\S])(?=情感分析|行动建议|### .*建议|$)/i
                            : stryMutAct_9fa48('584')
                              ? /[##\s]*关键发现[:：]?\s*\n([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                              : stryMutAct_9fa48('583')
                                ? /[##\s]*关键发现[:：]?\S*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                : stryMutAct_9fa48('582')
                                  ? /[##\s]*关键发现[:：]?\s\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                  : stryMutAct_9fa48('581')
                                    ? /[##\s]*关键发现[^:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                    : stryMutAct_9fa48('580')
                                      ? /[##\s]*关键发现[:：]\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                      : stryMutAct_9fa48('579')
                                        ? /[##\S]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                        : stryMutAct_9fa48('578')
                                          ? /[^##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                          : stryMutAct_9fa48('577')
                                            ? /[##\s]关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i
                                            : (stryCov_9fa48(
                                                '577',
                                                '578',
                                                '579',
                                                '580',
                                                '581',
                                                '582',
                                                '583',
                                                '584',
                                                '585',
                                                '586',
                                                '587',
                                                '588',
                                                '589',
                                                '590',
                                                '591'
                                              ),
                                              /[##\s]*关键发现[:：]?\s*\n?([\s\S]*?)(?=情感分析|行动建议|### .*建议|$)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('600')
                  ? /关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议)/i
                  : stryMutAct_9fa48('599')
                    ? /关键发现[\s:：]*([\s\S]*?)(?!情感分析|行动建议|$)/i
                    : stryMutAct_9fa48('598')
                      ? /关键发现[\s:：]*([\s\s]*?)(?=情感分析|行动建议|$)/i
                      : stryMutAct_9fa48('597')
                        ? /关键发现[\s:：]*([\S\S]*?)(?=情感分析|行动建议|$)/i
                        : stryMutAct_9fa48('596')
                          ? /关键发现[\s:：]*([^\s\S]*?)(?=情感分析|行动建议|$)/i
                          : stryMutAct_9fa48('595')
                            ? /关键发现[\s:：]*([\s\S])(?=情感分析|行动建议|$)/i
                            : stryMutAct_9fa48('594')
                              ? /关键发现[\S:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i
                              : stryMutAct_9fa48('593')
                                ? /关键发现[^\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i
                                : stryMutAct_9fa48('592')
                                  ? /关键发现[\s:：]([\s\S]*?)(?=情感分析|行动建议|$)/i
                                  : (stryCov_9fa48(
                                      '592',
                                      '593',
                                      '594',
                                      '595',
                                      '596',
                                      '597',
                                      '598',
                                      '599',
                                      '600'
                                    ),
                                    /关键发现[\s:：]*([\s\S]*?)(?=情感分析|行动建议|$)/i)
              ));
    if (
      stryMutAct_9fa48('602')
        ? false
        : stryMutAct_9fa48('601')
          ? true
          : (stryCov_9fa48('601', '602'), findingMatch)
    ) {
      if (stryMutAct_9fa48('603')) {
        {
        }
      } else {
        stryCov_9fa48('603');
        // Split by newlines or markdown list markers, filter out empty/heading lines
        const findings = stryMutAct_9fa48('604')
          ? findingMatch[1].split(/[\n]+/).map((f) =>
              f
                .replace(/^[-*•]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
          : (stryCov_9fa48('604'),
            findingMatch[1]
              .split(
                stryMutAct_9fa48('606')
                  ? /[^\n]+/
                  : stryMutAct_9fa48('605')
                    ? /[\n]/
                    : (stryCov_9fa48('605', '606'), /[\n]+/)
              )
              .map(
                stryMutAct_9fa48('607')
                  ? () => undefined
                  : (stryCov_9fa48('607'),
                    (f) =>
                      stryMutAct_9fa48('608')
                        ? f.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '')
                        : (stryCov_9fa48('608'),
                          f
                            .replace(
                              stryMutAct_9fa48('612')
                                ? /^[-*•]\S*/
                                : stryMutAct_9fa48('611')
                                  ? /^[-*•]\s/
                                  : stryMutAct_9fa48('610')
                                    ? /^[^-*•]\s*/
                                    : stryMutAct_9fa48('609')
                                      ? /[-*•]\s*/
                                      : (stryCov_9fa48('609', '610', '611', '612'), /^[-*•]\s*/),
                              stryMutAct_9fa48('613')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('613'), '')
                            )
                            .replace(
                              stryMutAct_9fa48('618')
                                ? /^\d+\.\S*/
                                : stryMutAct_9fa48('617')
                                  ? /^\d+\.\s/
                                  : stryMutAct_9fa48('616')
                                    ? /^\D+\.\s*/
                                    : stryMutAct_9fa48('615')
                                      ? /^\d\.\s*/
                                      : stryMutAct_9fa48('614')
                                        ? /\d+\.\s*/
                                        : (stryCov_9fa48('614', '615', '616', '617', '618'),
                                          /^\d+\.\s*/),
                              stryMutAct_9fa48('619')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('619'), '')
                            )
                            .trim()))
              )
              .filter(
                stryMutAct_9fa48('620')
                  ? () => undefined
                  : (stryCov_9fa48('620'),
                    (f) =>
                      stryMutAct_9fa48('624')
                        ? f.length <= 0
                        : stryMutAct_9fa48('623')
                          ? f.length >= 0
                          : stryMutAct_9fa48('622')
                            ? false
                            : stryMutAct_9fa48('621')
                              ? true
                              : (stryCov_9fa48('621', '622', '623', '624'), f.length > 0))
              ));
        keyFindings.push(
          ...(stryMutAct_9fa48('625') ? findings : (stryCov_9fa48('625'), findings.slice(0, 5)))
        );
      }
    }

    // Support both "### 2. 情感分析" and "情感分析:" formats
    const sentimentMatch = stryMutAct_9fa48('628')
      ? content.match(/情感分析[:：]\s*([\u4e00-\u9fa5]+)/i) &&
        content.match(
          /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
        )
      : stryMutAct_9fa48('627')
        ? false
        : stryMutAct_9fa48('626')
          ? true
          : (stryCov_9fa48('626', '627', '628'),
            content.match(
              stryMutAct_9fa48('633')
                ? /情感分析[:：]\s*([^\u4e00-\u9fa5]+)/i
                : stryMutAct_9fa48('632')
                  ? /情感分析[:：]\s*([\u4e00-\u9fa5])/i
                  : stryMutAct_9fa48('631')
                    ? /情感分析[:：]\S*([\u4e00-\u9fa5]+)/i
                    : stryMutAct_9fa48('630')
                      ? /情感分析[:：]\s([\u4e00-\u9fa5]+)/i
                      : stryMutAct_9fa48('629')
                        ? /情感分析[^:：]\s*([\u4e00-\u9fa5]+)/i
                        : (stryCov_9fa48('629', '630', '631', '632', '633'),
                          /情感分析[:：]\s*([\u4e00-\u9fa5]+)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('637')
                  ? /情感分析[\s\s]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                  : stryMutAct_9fa48('636')
                    ? /情感分析[\S\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                    : stryMutAct_9fa48('635')
                      ? /情感分析[^\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                      : stryMutAct_9fa48('634')
                        ? /情感分析[\s\S](积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i
                        : (stryCov_9fa48('634', '635', '636', '637'),
                          /情感分析[\s\S]*?(积极|正面|negative|positive|消极|负面|negative|neutral|中立|neutral)/i)
              ));
    if (
      stryMutAct_9fa48('639')
        ? false
        : stryMutAct_9fa48('638')
          ? true
          : (stryCov_9fa48('638', '639'), sentimentMatch)
    ) {
      if (stryMutAct_9fa48('640')) {
        {
        }
      } else {
        stryCov_9fa48('640');
        const raw = stryMutAct_9fa48('642')
          ? sentimentMatch[1].toLowerCase()
          : stryMutAct_9fa48('641')
            ? sentimentMatch[1].trim().toUpperCase()
            : (stryCov_9fa48('641', '642'), sentimentMatch[1].trim().toLowerCase());
        if (
          stryMutAct_9fa48('645')
            ? (raw.includes('积极') || raw.includes('正面')) && raw === 'positive'
            : stryMutAct_9fa48('644')
              ? false
              : stryMutAct_9fa48('643')
                ? true
                : (stryCov_9fa48('643', '644', '645'),
                  (stryMutAct_9fa48('647')
                    ? raw.includes('积极') && raw.includes('正面')
                    : stryMutAct_9fa48('646')
                      ? false
                      : (stryCov_9fa48('646', '647'),
                        raw.includes(
                          stryMutAct_9fa48('648') ? '' : (stryCov_9fa48('648'), '积极')
                        ) ||
                          raw.includes(
                            stryMutAct_9fa48('649') ? '' : (stryCov_9fa48('649'), '正面')
                          ))) ||
                    (stryMutAct_9fa48('651')
                      ? raw !== 'positive'
                      : stryMutAct_9fa48('650')
                        ? false
                        : (stryCov_9fa48('650', '651'),
                          raw ===
                            (stryMutAct_9fa48('652') ? '' : (stryCov_9fa48('652'), 'positive')))))
        ) {
          if (stryMutAct_9fa48('653')) {
            {
            }
          } else {
            stryCov_9fa48('653');
            sentiment = stryMutAct_9fa48('654') ? '' : (stryCov_9fa48('654'), 'positive');
          }
        } else if (
          stryMutAct_9fa48('657')
            ? (raw.includes('消极') || raw.includes('负面')) && raw === 'negative'
            : stryMutAct_9fa48('656')
              ? false
              : stryMutAct_9fa48('655')
                ? true
                : (stryCov_9fa48('655', '656', '657'),
                  (stryMutAct_9fa48('659')
                    ? raw.includes('消极') && raw.includes('负面')
                    : stryMutAct_9fa48('658')
                      ? false
                      : (stryCov_9fa48('658', '659'),
                        raw.includes(
                          stryMutAct_9fa48('660') ? '' : (stryCov_9fa48('660'), '消极')
                        ) ||
                          raw.includes(
                            stryMutAct_9fa48('661') ? '' : (stryCov_9fa48('661'), '负面')
                          ))) ||
                    (stryMutAct_9fa48('663')
                      ? raw !== 'negative'
                      : stryMutAct_9fa48('662')
                        ? false
                        : (stryCov_9fa48('662', '663'),
                          raw ===
                            (stryMutAct_9fa48('664') ? '' : (stryCov_9fa48('664'), 'negative')))))
        ) {
          if (stryMutAct_9fa48('665')) {
            {
            }
          } else {
            stryCov_9fa48('665');
            sentiment = stryMutAct_9fa48('666') ? '' : (stryCov_9fa48('666'), 'negative');
          }
        } else {
          if (stryMutAct_9fa48('667')) {
            {
            }
          } else {
            stryCov_9fa48('667');
            sentiment = stryMutAct_9fa48('668') ? '' : (stryCov_9fa48('668'), 'neutral');
          }
        }
      }
    }

    // Support both "### 3. 行动建议" and "行动建议:" formats
    const recMatch = stryMutAct_9fa48('671')
      ? content.match(/行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i) &&
        content.match(/行动建议[\s\S]*?([\s\S]*)/i)
      : stryMutAct_9fa48('670')
        ? false
        : stryMutAct_9fa48('669')
          ? true
          : (stryCov_9fa48('669', '670', '671'),
            content.match(
              stryMutAct_9fa48('682')
                ? /行动建议[:：]?\s*\n?([\s\S]*?)(?=总结)/i
                : stryMutAct_9fa48('681')
                  ? /行动建议[:：]?\s*\n?([\s\S]*?)(?!总结|$)/i
                  : stryMutAct_9fa48('680')
                    ? /行动建议[:：]?\s*\n?([\s\s]*?)(?=总结|$)/i
                    : stryMutAct_9fa48('679')
                      ? /行动建议[:：]?\s*\n?([\S\S]*?)(?=总结|$)/i
                      : stryMutAct_9fa48('678')
                        ? /行动建议[:：]?\s*\n?([^\s\S]*?)(?=总结|$)/i
                        : stryMutAct_9fa48('677')
                          ? /行动建议[:：]?\s*\n?([\s\S])(?=总结|$)/i
                          : stryMutAct_9fa48('676')
                            ? /行动建议[:：]?\s*\n([\s\S]*?)(?=总结|$)/i
                            : stryMutAct_9fa48('675')
                              ? /行动建议[:：]?\S*\n?([\s\S]*?)(?=总结|$)/i
                              : stryMutAct_9fa48('674')
                                ? /行动建议[:：]?\s\n?([\s\S]*?)(?=总结|$)/i
                                : stryMutAct_9fa48('673')
                                  ? /行动建议[^:：]?\s*\n?([\s\S]*?)(?=总结|$)/i
                                  : stryMutAct_9fa48('672')
                                    ? /行动建议[:：]\s*\n?([\s\S]*?)(?=总结|$)/i
                                    : (stryCov_9fa48(
                                        '672',
                                        '673',
                                        '674',
                                        '675',
                                        '676',
                                        '677',
                                        '678',
                                        '679',
                                        '680',
                                        '681',
                                        '682'
                                      ),
                                      /行动建议[:：]?\s*\n?([\s\S]*?)(?=总结|$)/i)
            ) ||
              content.match(
                stryMutAct_9fa48('690')
                  ? /行动建议[\s\S]*?([\s\s]*)/i
                  : stryMutAct_9fa48('689')
                    ? /行动建议[\s\S]*?([\S\S]*)/i
                    : stryMutAct_9fa48('688')
                      ? /行动建议[\s\S]*?([^\s\S]*)/i
                      : stryMutAct_9fa48('687')
                        ? /行动建议[\s\S]*?([\s\S])/i
                        : stryMutAct_9fa48('686')
                          ? /行动建议[\s\s]*?([\s\S]*)/i
                          : stryMutAct_9fa48('685')
                            ? /行动建议[\S\S]*?([\s\S]*)/i
                            : stryMutAct_9fa48('684')
                              ? /行动建议[^\s\S]*?([\s\S]*)/i
                              : stryMutAct_9fa48('683')
                                ? /行动建议[\s\S]([\s\S]*)/i
                                : (stryCov_9fa48(
                                    '683',
                                    '684',
                                    '685',
                                    '686',
                                    '687',
                                    '688',
                                    '689',
                                    '690'
                                  ),
                                  /行动建议[\s\S]*?([\s\S]*)/i)
              ));
    if (
      stryMutAct_9fa48('692')
        ? false
        : stryMutAct_9fa48('691')
          ? true
          : (stryCov_9fa48('691', '692'), recMatch)
    ) {
      if (stryMutAct_9fa48('693')) {
        {
        }
      } else {
        stryCov_9fa48('693');
        const recs = stryMutAct_9fa48('694')
          ? recMatch[1].split(/[\n]+/).map((r) =>
              r
                .replace(/^[-*•]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
          : (stryCov_9fa48('694'),
            recMatch[1]
              .split(
                stryMutAct_9fa48('696')
                  ? /[^\n]+/
                  : stryMutAct_9fa48('695')
                    ? /[\n]/
                    : (stryCov_9fa48('695', '696'), /[\n]+/)
              )
              .map(
                stryMutAct_9fa48('697')
                  ? () => undefined
                  : (stryCov_9fa48('697'),
                    (r) =>
                      stryMutAct_9fa48('698')
                        ? r.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '')
                        : (stryCov_9fa48('698'),
                          r
                            .replace(
                              stryMutAct_9fa48('702')
                                ? /^[-*•]\S*/
                                : stryMutAct_9fa48('701')
                                  ? /^[-*•]\s/
                                  : stryMutAct_9fa48('700')
                                    ? /^[^-*•]\s*/
                                    : stryMutAct_9fa48('699')
                                      ? /[-*•]\s*/
                                      : (stryCov_9fa48('699', '700', '701', '702'), /^[-*•]\s*/),
                              stryMutAct_9fa48('703')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('703'), '')
                            )
                            .replace(
                              stryMutAct_9fa48('708')
                                ? /^\d+\.\S*/
                                : stryMutAct_9fa48('707')
                                  ? /^\d+\.\s/
                                  : stryMutAct_9fa48('706')
                                    ? /^\D+\.\s*/
                                    : stryMutAct_9fa48('705')
                                      ? /^\d\.\s*/
                                      : stryMutAct_9fa48('704')
                                        ? /\d+\.\s*/
                                        : (stryCov_9fa48('704', '705', '706', '707', '708'),
                                          /^\d+\.\s*/),
                              stryMutAct_9fa48('709')
                                ? 'Stryker was here!'
                                : (stryCov_9fa48('709'), '')
                            )
                            .trim()))
              )
              .filter(
                stryMutAct_9fa48('710')
                  ? () => undefined
                  : (stryCov_9fa48('710'),
                    (r) =>
                      stryMutAct_9fa48('714')
                        ? r.length <= 0
                        : stryMutAct_9fa48('713')
                          ? r.length >= 0
                          : stryMutAct_9fa48('712')
                            ? false
                            : stryMutAct_9fa48('711')
                              ? true
                              : (stryCov_9fa48('711', '712', '713', '714'), r.length > 0))
              ));
        recommendations.push(
          ...(stryMutAct_9fa48('715') ? recs : (stryCov_9fa48('715'), recs.slice(0, 5)))
        );
      }
    }
    return stryMutAct_9fa48('716')
      ? {}
      : (stryCov_9fa48('716'),
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
  if (stryMutAct_9fa48('717')) {
    {
    }
  } else {
    stryCov_9fa48('717');
    return stryMutAct_9fa48('718')
      ? {}
      : (stryCov_9fa48('718'),
        {
          interviewId,
          content: stryMutAct_9fa48('719')
            ? ``
            : (stryCov_9fa48('719'),
              `# 访谈报告\n\n主题: ${topic}\n\n问答记录:\n${qaPairs.map(stryMutAct_9fa48('720') ? () => undefined : (stryCov_9fa48('720'), (qa) => (stryMutAct_9fa48('721') ? `` : (stryCov_9fa48('721'), `Q: ${qa.question}\nA: ${qa.answer}`)))).join(stryMutAct_9fa48('722') ? '' : (stryCov_9fa48('722'), '\n\n'))}`),
          keyFindings: qaPairs.map(
            stryMutAct_9fa48('723')
              ? () => undefined
              : (stryCov_9fa48('723'),
                (qa) =>
                  stryMutAct_9fa48('724')
                    ? qa.answer
                    : (stryCov_9fa48('724'), qa.answer.substring(0, 50)))
          ),
          sentiment: stryMutAct_9fa48('725') ? '' : (stryCov_9fa48('725'), 'neutral'),
          recommendations: stryMutAct_9fa48('726')
            ? []
            : (stryCov_9fa48('726'),
              [stryMutAct_9fa48('727') ? '' : (stryCov_9fa48('727'), '建议进行更深入的后续访谈')]),
          generatedAt: new Date(),
        });
  }
}
async function saveReport(report: Report): Promise<string> {
  if (stryMutAct_9fa48('728')) {
    {
    }
  } else {
    stryCov_9fa48('728');
    const reportsDir = stryMutAct_9fa48('731')
      ? process.env.REPORTS_DIR && './reports'
      : stryMutAct_9fa48('730')
        ? false
        : stryMutAct_9fa48('729')
          ? true
          : (stryCov_9fa48('729', '730', '731'),
            process.env.REPORTS_DIR ||
              (stryMutAct_9fa48('732') ? '' : (stryCov_9fa48('732'), './reports')));
    const filename = stryMutAct_9fa48('733')
      ? ``
      : (stryCov_9fa48('733'), `${report.interviewId}_${Date.now()}.md`);
    const filepath = path.join(reportsDir, filename);
    fs.mkdirSync(
      reportsDir,
      stryMutAct_9fa48('734')
        ? {}
        : (stryCov_9fa48('734'),
          {
            recursive: stryMutAct_9fa48('735') ? false : (stryCov_9fa48('735'), true),
          })
    );
    fs.writeFileSync(filepath, report.content);
    info(
      stryMutAct_9fa48('736') ? '' : (stryCov_9fa48('736'), 'Report saved'),
      stryMutAct_9fa48('737')
        ? {}
        : (stryCov_9fa48('737'),
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
  if (stryMutAct_9fa48('738')) {
    {
    }
  } else {
    stryCov_9fa48('738');
    const qaText = qaPairs
      .map(
        stryMutAct_9fa48('739')
          ? () => undefined
          : (stryCov_9fa48('739'),
            (qa) =>
              stryMutAct_9fa48('740')
                ? ``
                : (stryCov_9fa48('740'), `Q: ${qa.question}\nA: ${qa.answer}`))
      )
      .join(stryMutAct_9fa48('741') ? '' : (stryCov_9fa48('741'), '\n\n'));
    const prompt = promptService.render(
      stryMutAct_9fa48('742') ? '' : (stryCov_9fa48('742'), 'analyzeWithDimensions'),
      stryMutAct_9fa48('743')
        ? {}
        : (stryCov_9fa48('743'),
          {
            dimensions: stryMutAct_9fa48('746')
              ? dimensionsJson && '[No preset dimensions]'
              : stryMutAct_9fa48('745')
                ? false
                : stryMutAct_9fa48('744')
                  ? true
                  : (stryCov_9fa48('744', '745', '746'),
                    dimensionsJson ||
                      (stryMutAct_9fa48('747')
                        ? ''
                        : (stryCov_9fa48('747'), '[No preset dimensions]'))),
            qaPairs: qaText,
          })
    );
    try {
      if (stryMutAct_9fa48('748')) {
        {
        }
      } else {
        stryCov_9fa48('748');
        const response = await withRetry(
          stryMutAct_9fa48('749')
            ? () => undefined
            : (stryCov_9fa48('749'),
              () =>
                llm.chat(
                  stryMutAct_9fa48('750')
                    ? {}
                    : (stryCov_9fa48('750'),
                      {
                        model: DEFAULT_MODEL,
                        messages: stryMutAct_9fa48('751')
                          ? []
                          : (stryCov_9fa48('751'),
                            [
                              stryMutAct_9fa48('752')
                                ? {}
                                : (stryCov_9fa48('752'),
                                  {
                                    role: stryMutAct_9fa48('753')
                                      ? ''
                                      : (stryCov_9fa48('753'), 'user'),
                                    content: prompt,
                                  }),
                            ]),
                        max_tokens: 2000,
                        temperature: 0.1,
                      })
                ))
        );
        const parsed = parseDimensionAnalysis(response.content);
        return stryMutAct_9fa48('754')
          ? {}
          : (stryCov_9fa48('754'),
            {
              interviewId,
              content: response.content,
              keyFindings: stryMutAct_9fa48('755')
                ? ['Stryker was here']
                : (stryCov_9fa48('755'), []),
              sentiment: stryMutAct_9fa48('756') ? 'Stryker was here!' : (stryCov_9fa48('756'), ''),
              recommendations: stryMutAct_9fa48('757')
                ? ['Stryker was here']
                : (stryCov_9fa48('757'), []),
              generatedAt: new Date(),
              ...parsed,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('758')) {
        {
        }
      } else {
        stryCov_9fa48('758');
        info(
          stryMutAct_9fa48('759') ? '' : (stryCov_9fa48('759'), 'Dimension analysis failed'),
          stryMutAct_9fa48('760')
            ? {}
            : (stryCov_9fa48('760'),
              {
                interviewId,
                error: (e as Error).message,
              })
        );
        return stryMutAct_9fa48('761')
          ? {}
          : (stryCov_9fa48('761'),
            {
              interviewId,
              content: stryMutAct_9fa48('762') ? 'Stryker was here!' : (stryCov_9fa48('762'), ''),
              keyFindings: stryMutAct_9fa48('763')
                ? ['Stryker was here']
                : (stryCov_9fa48('763'), []),
              sentiment: stryMutAct_9fa48('764') ? 'Stryker was here!' : (stryCov_9fa48('764'), ''),
              recommendations: stryMutAct_9fa48('765')
                ? ['Stryker was here']
                : (stryCov_9fa48('765'), []),
              generatedAt: new Date(),
              dimensionTags: stryMutAct_9fa48('766')
                ? ['Stryker was here']
                : (stryCov_9fa48('766'), []),
              emergentTags: stryMutAct_9fa48('767')
                ? ['Stryker was here']
                : (stryCov_9fa48('767'), []),
            });
      }
    }
  }
}
function parseDimensionAnalysis(
  content: string
): Pick<ReportWithDimensions, 'dimensionTags' | 'emergentTags' | 'interviewerRating'> {
  if (stryMutAct_9fa48('768')) {
    {
    }
  } else {
    stryCov_9fa48('768');
    try {
      if (stryMutAct_9fa48('769')) {
        {
        }
      } else {
        stryCov_9fa48('769');
        const cleaned = stryMutAct_9fa48('770')
          ? content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
          : (stryCov_9fa48('770'),
            content
              .replace(
                stryMutAct_9fa48('771') ? /```json\n/g : (stryCov_9fa48('771'), /```json\n?/g),
                stryMutAct_9fa48('772') ? 'Stryker was here!' : (stryCov_9fa48('772'), '')
              )
              .replace(
                stryMutAct_9fa48('773') ? /```\n/g : (stryCov_9fa48('773'), /```\n?/g),
                stryMutAct_9fa48('774') ? 'Stryker was here!' : (stryCov_9fa48('774'), '')
              )
              .trim());
        const jsonRaw = JSON.parse(cleaned);
        if (
          stryMutAct_9fa48('777')
            ? typeof jsonRaw !== 'object' && jsonRaw === null
            : stryMutAct_9fa48('776')
              ? false
              : stryMutAct_9fa48('775')
                ? true
                : (stryCov_9fa48('775', '776', '777'),
                  (stryMutAct_9fa48('779')
                    ? typeof jsonRaw === 'object'
                    : stryMutAct_9fa48('778')
                      ? false
                      : (stryCov_9fa48('778', '779'),
                        typeof jsonRaw !==
                          (stryMutAct_9fa48('780') ? '' : (stryCov_9fa48('780'), 'object')))) ||
                    (stryMutAct_9fa48('782')
                      ? jsonRaw !== null
                      : stryMutAct_9fa48('781')
                        ? false
                        : (stryCov_9fa48('781', '782'), jsonRaw === null)))
        ) {
          if (stryMutAct_9fa48('783')) {
            {
            }
          } else {
            stryCov_9fa48('783');
            return stryMutAct_9fa48('784')
              ? {}
              : (stryCov_9fa48('784'),
                {
                  dimensionTags: stryMutAct_9fa48('785')
                    ? ['Stryker was here']
                    : (stryCov_9fa48('785'), []),
                  emergentTags: stryMutAct_9fa48('786')
                    ? ['Stryker was here']
                    : (stryCov_9fa48('786'), []),
                });
          }
        }
        const jsonStr = jsonRaw as Record<string, unknown>;
        return stryMutAct_9fa48('787')
          ? {}
          : (stryCov_9fa48('787'),
            {
              dimensionTags: Array.isArray(jsonStr.dimensionTags)
                ? jsonStr.dimensionTags
                : stryMutAct_9fa48('788')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('788'), []),
              emergentTags: Array.isArray(jsonStr.emergentTags)
                ? jsonStr.emergentTags
                : stryMutAct_9fa48('789')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('789'), []),
              interviewerRating: (
                stryMutAct_9fa48('792')
                  ? typeof jsonStr.interviewerRating !== 'number'
                  : stryMutAct_9fa48('791')
                    ? false
                    : stryMutAct_9fa48('790')
                      ? true
                      : (stryCov_9fa48('790', '791', '792'),
                        typeof jsonStr.interviewerRating ===
                          (stryMutAct_9fa48('793') ? '' : (stryCov_9fa48('793'), 'number')))
              )
                ? jsonStr.interviewerRating
                : undefined,
            });
      }
    } catch {
      if (stryMutAct_9fa48('794')) {
        {
        }
      } else {
        stryCov_9fa48('794');
        return stryMutAct_9fa48('795')
          ? {}
          : (stryCov_9fa48('795'),
            {
              dimensionTags: stryMutAct_9fa48('796')
                ? ['Stryker was here']
                : (stryCov_9fa48('796'), []),
              emergentTags: stryMutAct_9fa48('797')
                ? ['Stryker was here']
                : (stryCov_9fa48('797'), []),
            });
      }
    }
  }
}
