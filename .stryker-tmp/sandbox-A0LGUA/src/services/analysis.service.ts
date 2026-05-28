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
import { PrismaClient } from '@prisma/client';
import { error, info } from '../utils/logger.js';
import { anonymizePII } from '../utils/pii-anonymizer.js';
import { recordAnalysisFailure } from './dead-letter.service.js';
import {
  type Report,
  type ReportWithDimensions,
  generateReport,
  generateReportWithDimensions,
} from './report.service.js';
export interface AnalysisResult {
  interviewId: string;
  report: Report;
  metrics: StatisticalMetrics;
}
export interface StatisticalMetrics {
  totalResponses: number;
  avgResponseLength: number;
  followupDepth: number;
  completionRate: number;
  sentiment: string;
  topicCoverage: string[];
}
export interface ClusterAnalysis {
  clusterId: string;
  name: string;
  memberCount: number;
  avgSentiment: string;
  keyThemes: string[];
  representativeViewpoints: string[];
}
export class AnalysisService {
  private _prisma: PrismaClient;
  constructor(prisma?: PrismaClient) {
    if (stryMutAct_9fa48('2485')) {
      {
      }
    } else {
      stryCov_9fa48('2485');
      this._prisma = stryMutAct_9fa48('2486')
        ? prisma && new PrismaClient()
        : (stryCov_9fa48('2486'), prisma ?? new PrismaClient());
    }
  }
  get prisma(): PrismaClient {
    if (stryMutAct_9fa48('2487')) {
      {
      }
    } else {
      stryCov_9fa48('2487');
      return this._prisma;
    }
  }
  async analyzeInterview(interviewId: string): Promise<AnalysisResult> {
    if (stryMutAct_9fa48('2488')) {
      {
      }
    } else {
      stryCov_9fa48('2488');
      const interview = await this.prisma.interview.findUnique(
        stryMutAct_9fa48('2489')
          ? {}
          : (stryCov_9fa48('2489'),
            {
              where: stryMutAct_9fa48('2490')
                ? {}
                : (stryCov_9fa48('2490'),
                  {
                    id: interviewId,
                  }),
              include: stryMutAct_9fa48('2491')
                ? {}
                : (stryCov_9fa48('2491'),
                  {
                    responses: stryMutAct_9fa48('2492') ? false : (stryCov_9fa48('2492'), true),
                    messages: stryMutAct_9fa48('2493') ? false : (stryCov_9fa48('2493'), true),
                  }),
            })
      );
      if (
        stryMutAct_9fa48('2496')
          ? false
          : stryMutAct_9fa48('2495')
            ? true
            : stryMutAct_9fa48('2494')
              ? interview
              : (stryCov_9fa48('2494', '2495', '2496'), !interview)
      ) {
        if (stryMutAct_9fa48('2497')) {
          {
          }
        } else {
          stryCov_9fa48('2497');
          throw new Error(
            stryMutAct_9fa48('2498') ? '' : (stryCov_9fa48('2498'), 'Interview not found')
          );
        }
      }
      const qaPairs = interview.responses.map(
        stryMutAct_9fa48('2499')
          ? () => undefined
          : (stryCov_9fa48('2499'),
            (r) =>
              stryMutAct_9fa48('2500')
                ? {}
                : (stryCov_9fa48('2500'),
                  {
                    question: r.questionId,
                    answer: r.content,
                  }))
      );
      const topic = interview.templateId;
      const report = await generateReport(interviewId, topic, qaPairs);
      const metrics = this.calculateMetrics(interview.responses);
      let dimResult: ReportWithDimensions = stryMutAct_9fa48('2501')
        ? {}
        : (stryCov_9fa48('2501'),
          {
            interviewId,
            content: stryMutAct_9fa48('2502') ? 'Stryker was here!' : (stryCov_9fa48('2502'), ''),
            keyFindings: stryMutAct_9fa48('2503')
              ? ['Stryker was here']
              : (stryCov_9fa48('2503'), []),
            sentiment: stryMutAct_9fa48('2504') ? 'Stryker was here!' : (stryCov_9fa48('2504'), ''),
            recommendations: stryMutAct_9fa48('2505')
              ? ['Stryker was here']
              : (stryCov_9fa48('2505'), []),
            generatedAt: new Date(),
            dimensionTags: stryMutAct_9fa48('2506')
              ? ['Stryker was here']
              : (stryCov_9fa48('2506'), []),
            emergentTags: stryMutAct_9fa48('2507')
              ? ['Stryker was here']
              : (stryCov_9fa48('2507'), []),
          });
      try {
        if (stryMutAct_9fa48('2508')) {
          {
          }
        } else {
          stryCov_9fa48('2508');
          const template = await this.prisma.template.findUnique(
            stryMutAct_9fa48('2509')
              ? {}
              : (stryCov_9fa48('2509'),
                {
                  where: stryMutAct_9fa48('2510')
                    ? {}
                    : (stryCov_9fa48('2510'),
                      {
                        id: interview.templateId,
                      }),
                })
          );
          const dimsJson = (
            stryMutAct_9fa48('2511')
              ? template.dimensions
              : (stryCov_9fa48('2511'), template?.dimensions)
          )
            ? JSON.stringify(template.dimensions)
            : null;
          if (
            stryMutAct_9fa48('2513')
              ? false
              : stryMutAct_9fa48('2512')
                ? true
                : (stryCov_9fa48('2512', '2513'), dimsJson)
          ) {
            if (stryMutAct_9fa48('2514')) {
              {
              }
            } else {
              stryCov_9fa48('2514');
              const { VolcengineLLM } = await import('../integrations/llm/volcengine.js');
              const llm = VolcengineLLM.fromEnv();
              dimResult = await generateReportWithDimensions(
                interviewId,
                topic,
                qaPairs,
                dimsJson,
                llm
              );
              dimResult.dimensionTags = stryMutAct_9fa48('2515')
                ? dimResult.dimensionTags.map((tag) => ({
                    ...tag,
                    quotes: tag.quotes.map((q: string) => anonymizePII(q)),
                  }))
                : (stryCov_9fa48('2515'),
                  dimResult.dimensionTags?.map(
                    stryMutAct_9fa48('2516')
                      ? () => undefined
                      : (stryCov_9fa48('2516'),
                        (tag) =>
                          stryMutAct_9fa48('2517')
                            ? {}
                            : (stryCov_9fa48('2517'),
                              {
                                ...tag,
                                quotes: tag.quotes.map(
                                  stryMutAct_9fa48('2518')
                                    ? () => undefined
                                    : (stryCov_9fa48('2518'), (q: string) => anonymizePII(q))
                                ),
                              }))
                  ));
            }
          }
        }
      } catch (e) {
        if (stryMutAct_9fa48('2519')) {
          {
          }
        } else {
          stryCov_9fa48('2519');
          error(
            stryMutAct_9fa48('2520') ? '' : (stryCov_9fa48('2520'), 'Dimension analysis failed'),
            stryMutAct_9fa48('2521')
              ? {}
              : (stryCov_9fa48('2521'),
                {
                  interviewId,
                  error: e instanceof Error ? e.message : String(e),
                })
          );
          await recordAnalysisFailure(
            interviewId,
            stryMutAct_9fa48('2522') ? '' : (stryCov_9fa48('2522'), 'DIMENSION_ANALYSIS_FAILED'),
            e instanceof Error ? e.message : String(e)
          );
        }
      }
      await this.prisma.analysisReport.create(
        stryMutAct_9fa48('2523')
          ? {}
          : (stryCov_9fa48('2523'),
            {
              data: stryMutAct_9fa48('2524')
                ? {}
                : (stryCov_9fa48('2524'),
                  {
                    interviewId,
                    content: report.content,
                    keyFindings: report.keyFindings,
                    sentiment: report.sentiment,
                    recommendations: report.recommendations,
                    dimensionTags: (
                      stryMutAct_9fa48('2525')
                        ? dimResult.dimensionTags.length
                        : (stryCov_9fa48('2525'), dimResult.dimensionTags?.length)
                    )
                      ? dimResult.dimensionTags
                      : undefined,
                    emergentTags: (
                      stryMutAct_9fa48('2526')
                        ? dimResult.emergentTags.length
                        : (stryCov_9fa48('2526'), dimResult.emergentTags?.length)
                    )
                      ? dimResult.emergentTags
                      : undefined,
                    interviewerRating: stryMutAct_9fa48('2527')
                      ? dimResult.interviewerRating && undefined
                      : (stryCov_9fa48('2527'), dimResult.interviewerRating ?? undefined),
                  }),
            })
      );
      return stryMutAct_9fa48('2528')
        ? {}
        : (stryCov_9fa48('2528'),
          {
            interviewId,
            report,
            metrics,
          });
    }
  }
  async batchAnalyze(planId: string): Promise<AnalysisResult[]> {
    if (stryMutAct_9fa48('2529')) {
      {
      }
    } else {
      stryCov_9fa48('2529');
      const interviews = await this.prisma.interview.findMany(
        stryMutAct_9fa48('2530')
          ? {}
          : (stryCov_9fa48('2530'),
            {
              where: stryMutAct_9fa48('2531')
                ? {}
                : (stryCov_9fa48('2531'),
                  {
                    planId,
                    status: stryMutAct_9fa48('2532') ? '' : (stryCov_9fa48('2532'), 'COMPLETED'),
                  }),
            })
      );
      info(
        stryMutAct_9fa48('2533') ? '' : (stryCov_9fa48('2533'), 'Batch analyzing interviews'),
        stryMutAct_9fa48('2534')
          ? {}
          : (stryCov_9fa48('2534'),
            {
              planId,
              count: interviews.length,
            })
      );
      const results: AnalysisResult[] = stryMutAct_9fa48('2535')
        ? ['Stryker was here']
        : (stryCov_9fa48('2535'), []);
      for (const interview of interviews) {
        if (stryMutAct_9fa48('2536')) {
          {
          }
        } else {
          stryCov_9fa48('2536');
          try {
            if (stryMutAct_9fa48('2537')) {
              {
              }
            } else {
              stryCov_9fa48('2537');
              const result = await this.analyzeInterview(interview.id);
              results.push(result);
            }
          } catch (e) {
            if (stryMutAct_9fa48('2538')) {
              {
              }
            } else {
              stryCov_9fa48('2538');
              info(
                stryMutAct_9fa48('2539')
                  ? ''
                  : (stryCov_9fa48('2539'), 'Failed to analyze interview'),
                stryMutAct_9fa48('2540')
                  ? {}
                  : (stryCov_9fa48('2540'),
                    {
                      interviewId: interview.id,
                      error: e,
                    })
              );
            }
          }
        }
      }
      return results;
    }
  }
  calculateMetrics(
    responses: Array<{
      content: string;
      followupDepth: number;
    }>
  ): StatisticalMetrics {
    if (stryMutAct_9fa48('2541')) {
      {
      }
    } else {
      stryCov_9fa48('2541');
      const totalResponses = responses.length;
      const avgResponseLength = (
        stryMutAct_9fa48('2545')
          ? totalResponses <= 0
          : stryMutAct_9fa48('2544')
            ? totalResponses >= 0
            : stryMutAct_9fa48('2543')
              ? false
              : stryMutAct_9fa48('2542')
                ? true
                : (stryCov_9fa48('2542', '2543', '2544', '2545'), totalResponses > 0)
      )
        ? stryMutAct_9fa48('2546')
          ? responses.reduce((sum, r) => sum + r.content.length, 0) * totalResponses
          : (stryCov_9fa48('2546'),
            responses.reduce(
              stryMutAct_9fa48('2547')
                ? () => undefined
                : (stryCov_9fa48('2547'),
                  (sum, r) =>
                    stryMutAct_9fa48('2548')
                      ? sum - r.content.length
                      : (stryCov_9fa48('2548'), sum + r.content.length)),
              0
            ) / totalResponses)
        : 0;
      const followupDepth = stryMutAct_9fa48('2549')
        ? Math.min(...responses.map((r) => r.followupDepth), 0)
        : (stryCov_9fa48('2549'),
          Math.max(
            ...responses.map(
              stryMutAct_9fa48('2550')
                ? () => undefined
                : (stryCov_9fa48('2550'), (r) => r.followupDepth)
            ),
            0
          ));
      const completionRate = (
        stryMutAct_9fa48('2554')
          ? totalResponses <= 0
          : stryMutAct_9fa48('2553')
            ? totalResponses >= 0
            : stryMutAct_9fa48('2552')
              ? false
              : stryMutAct_9fa48('2551')
                ? true
                : (stryCov_9fa48('2551', '2552', '2553', '2554'), totalResponses > 0)
      )
        ? 1
        : 0;
      const sentiment = this.analyzeSentiment(
        responses.map(
          stryMutAct_9fa48('2555') ? () => undefined : (stryCov_9fa48('2555'), (r) => r.content)
        )
      );
      return stryMutAct_9fa48('2556')
        ? {}
        : (stryCov_9fa48('2556'),
          {
            totalResponses,
            avgResponseLength: Math.round(avgResponseLength),
            followupDepth,
            completionRate,
            sentiment,
            topicCoverage: this.extractTopics(
              responses.map(
                stryMutAct_9fa48('2557')
                  ? () => undefined
                  : (stryCov_9fa48('2557'), (r) => r.content)
              )
            ),
          });
    }
  }
  private analyzeSentiment(contents: string[]): string {
    if (stryMutAct_9fa48('2558')) {
      {
      }
    } else {
      stryCov_9fa48('2558');
      const positiveWords = stryMutAct_9fa48('2559')
        ? []
        : (stryCov_9fa48('2559'),
          [
            stryMutAct_9fa48('2560') ? '' : (stryCov_9fa48('2560'), '好'),
            stryMutAct_9fa48('2561') ? '' : (stryCov_9fa48('2561'), '喜欢'),
            stryMutAct_9fa48('2562') ? '' : (stryCov_9fa48('2562'), '优秀'),
            stryMutAct_9fa48('2563') ? '' : (stryCov_9fa48('2563'), '满意'),
            stryMutAct_9fa48('2564') ? '' : (stryCov_9fa48('2564'), '棒'),
            stryMutAct_9fa48('2565') ? '' : (stryCov_9fa48('2565'), '感谢'),
            stryMutAct_9fa48('2566') ? '' : (stryCov_9fa48('2566'), 'great'),
            stryMutAct_9fa48('2567') ? '' : (stryCov_9fa48('2567'), 'good'),
            stryMutAct_9fa48('2568') ? '' : (stryCov_9fa48('2568'), 'excellent'),
          ]);
      const negativeWords = stryMutAct_9fa48('2569')
        ? []
        : (stryCov_9fa48('2569'),
          [
            stryMutAct_9fa48('2570') ? '' : (stryCov_9fa48('2570'), '差'),
            stryMutAct_9fa48('2571') ? '' : (stryCov_9fa48('2571'), '不好'),
            stryMutAct_9fa48('2572') ? '' : (stryCov_9fa48('2572'), '失望'),
            stryMutAct_9fa48('2573') ? '' : (stryCov_9fa48('2573'), '糟糕'),
            stryMutAct_9fa48('2574') ? '' : (stryCov_9fa48('2574'), 'bad'),
            stryMutAct_9fa48('2575') ? '' : (stryCov_9fa48('2575'), 'poor'),
            stryMutAct_9fa48('2576') ? '' : (stryCov_9fa48('2576'), 'terrible'),
          ]);
      let score = 0;
      const text = stryMutAct_9fa48('2577')
        ? contents.join('').toUpperCase()
        : (stryCov_9fa48('2577'),
          contents
            .join(stryMutAct_9fa48('2578') ? 'Stryker was here!' : (stryCov_9fa48('2578'), ''))
            .toLowerCase());
      for (const word of positiveWords) {
        if (stryMutAct_9fa48('2579')) {
          {
          }
        } else {
          stryCov_9fa48('2579');
          if (
            stryMutAct_9fa48('2581')
              ? false
              : stryMutAct_9fa48('2580')
                ? true
                : (stryCov_9fa48('2580', '2581'), text.includes(word))
          )
            stryMutAct_9fa48('2582') ? score-- : (stryCov_9fa48('2582'), score++);
        }
      }
      for (const word of negativeWords) {
        if (stryMutAct_9fa48('2583')) {
          {
          }
        } else {
          stryCov_9fa48('2583');
          if (
            stryMutAct_9fa48('2585')
              ? false
              : stryMutAct_9fa48('2584')
                ? true
                : (stryCov_9fa48('2584', '2585'), text.includes(word))
          )
            stryMutAct_9fa48('2586') ? score++ : (stryCov_9fa48('2586'), score--);
        }
      }
      if (
        stryMutAct_9fa48('2590')
          ? score <= 0
          : stryMutAct_9fa48('2589')
            ? score >= 0
            : stryMutAct_9fa48('2588')
              ? false
              : stryMutAct_9fa48('2587')
                ? true
                : (stryCov_9fa48('2587', '2588', '2589', '2590'), score > 0)
      )
        return stryMutAct_9fa48('2591') ? '' : (stryCov_9fa48('2591'), 'positive');
      if (
        stryMutAct_9fa48('2595')
          ? score >= 0
          : stryMutAct_9fa48('2594')
            ? score <= 0
            : stryMutAct_9fa48('2593')
              ? false
              : stryMutAct_9fa48('2592')
                ? true
                : (stryCov_9fa48('2592', '2593', '2594', '2595'), score < 0)
      )
        return stryMutAct_9fa48('2596') ? '' : (stryCov_9fa48('2596'), 'negative');
      return stryMutAct_9fa48('2597') ? '' : (stryCov_9fa48('2597'), 'neutral');
    }
  }
  private extractTopics(contents: string[]): string[] {
    if (stryMutAct_9fa48('2598')) {
      {
      }
    } else {
      stryCov_9fa48('2598');
      const topics = new Set<string>();
      const keywords = stryMutAct_9fa48('2599')
        ? []
        : (stryCov_9fa48('2599'),
          [
            stryMutAct_9fa48('2600') ? '' : (stryCov_9fa48('2600'), '产品'),
            stryMutAct_9fa48('2601') ? '' : (stryCov_9fa48('2601'), '功能'),
            stryMutAct_9fa48('2602') ? '' : (stryCov_9fa48('2602'), '体验'),
            stryMutAct_9fa48('2603') ? '' : (stryCov_9fa48('2603'), '服务'),
            stryMutAct_9fa48('2604') ? '' : (stryCov_9fa48('2604'), '价格'),
            stryMutAct_9fa48('2605') ? '' : (stryCov_9fa48('2605'), '质量'),
            stryMutAct_9fa48('2606') ? '' : (stryCov_9fa48('2606'), '技术'),
            stryMutAct_9fa48('2607') ? '' : (stryCov_9fa48('2607'), '团队'),
            stryMutAct_9fa48('2608') ? '' : (stryCov_9fa48('2608'), '市场'),
          ]);
      const text = contents.join(
        stryMutAct_9fa48('2609') ? 'Stryker was here!' : (stryCov_9fa48('2609'), '')
      );
      for (const keyword of keywords) {
        if (stryMutAct_9fa48('2610')) {
          {
          }
        } else {
          stryCov_9fa48('2610');
          if (
            stryMutAct_9fa48('2612')
              ? false
              : stryMutAct_9fa48('2611')
                ? true
                : (stryCov_9fa48('2611', '2612'), text.includes(keyword))
          ) {
            if (stryMutAct_9fa48('2613')) {
              {
              }
            } else {
              stryCov_9fa48('2613');
              topics.add(keyword);
            }
          }
        }
      }
      return Array.from(topics);
    }
  }
  async compareClusters(clusterIds: string[]): Promise<ClusterAnalysis[]> {
    if (stryMutAct_9fa48('2614')) {
      {
      }
    } else {
      stryCov_9fa48('2614');
      const clusters: ClusterAnalysis[] = stryMutAct_9fa48('2615')
        ? ['Stryker was here']
        : (stryCov_9fa48('2615'), []);
      for (const clusterId of clusterIds) {
        if (stryMutAct_9fa48('2616')) {
          {
          }
        } else {
          stryCov_9fa48('2616');
          const interviews = await this.prisma.interview.findMany(
            stryMutAct_9fa48('2617')
              ? {}
              : (stryCov_9fa48('2617'),
                {
                  where: stryMutAct_9fa48('2618')
                    ? {}
                    : (stryCov_9fa48('2618'),
                      {
                        planId: clusterId,
                      }),
                  include: stryMutAct_9fa48('2619')
                    ? {}
                    : (stryCov_9fa48('2619'),
                      {
                        responses: stryMutAct_9fa48('2620') ? false : (stryCov_9fa48('2620'), true),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('2623')
              ? interviews.length !== 0
              : stryMutAct_9fa48('2622')
                ? false
                : stryMutAct_9fa48('2621')
                  ? true
                  : (stryCov_9fa48('2621', '2622', '2623'), interviews.length === 0)
          )
            continue;
          const allContent = interviews.flatMap(
            stryMutAct_9fa48('2624')
              ? () => undefined
              : (stryCov_9fa48('2624'),
                (i) =>
                  i.responses.map(
                    stryMutAct_9fa48('2625')
                      ? () => undefined
                      : (stryCov_9fa48('2625'), (r) => r.content)
                  ))
          );
          const sentiments = allContent.map(
            stryMutAct_9fa48('2626')
              ? () => undefined
              : (stryCov_9fa48('2626'),
                (c) =>
                  this.analyzeSentiment(
                    stryMutAct_9fa48('2627') ? [] : (stryCov_9fa48('2627'), [c])
                  ))
          );
          const avgSentiment = (
            stryMutAct_9fa48('2631')
              ? sentiments.filter((s) => s === 'positive').length <=
                sentiments.filter((s) => s === 'negative').length
              : stryMutAct_9fa48('2630')
                ? sentiments.filter((s) => s === 'positive').length >=
                  sentiments.filter((s) => s === 'negative').length
                : stryMutAct_9fa48('2629')
                  ? false
                  : stryMutAct_9fa48('2628')
                    ? true
                    : (stryCov_9fa48('2628', '2629', '2630', '2631'),
                      (stryMutAct_9fa48('2632')
                        ? sentiments.length
                        : (stryCov_9fa48('2632'),
                          sentiments.filter(
                            stryMutAct_9fa48('2633')
                              ? () => undefined
                              : (stryCov_9fa48('2633'),
                                (s) =>
                                  stryMutAct_9fa48('2636')
                                    ? s !== 'positive'
                                    : stryMutAct_9fa48('2635')
                                      ? false
                                      : stryMutAct_9fa48('2634')
                                        ? true
                                        : (stryCov_9fa48('2634', '2635', '2636'),
                                          s ===
                                            (stryMutAct_9fa48('2637')
                                              ? ''
                                              : (stryCov_9fa48('2637'), 'positive'))))
                          ).length)) >
                        (stryMutAct_9fa48('2638')
                          ? sentiments.length
                          : (stryCov_9fa48('2638'),
                            sentiments.filter(
                              stryMutAct_9fa48('2639')
                                ? () => undefined
                                : (stryCov_9fa48('2639'),
                                  (s) =>
                                    stryMutAct_9fa48('2642')
                                      ? s !== 'negative'
                                      : stryMutAct_9fa48('2641')
                                        ? false
                                        : stryMutAct_9fa48('2640')
                                          ? true
                                          : (stryCov_9fa48('2640', '2641', '2642'),
                                            s ===
                                              (stryMutAct_9fa48('2643')
                                                ? ''
                                                : (stryCov_9fa48('2643'), 'negative'))))
                            ).length)))
          )
            ? stryMutAct_9fa48('2644')
              ? ''
              : (stryCov_9fa48('2644'), 'positive')
            : stryMutAct_9fa48('2645')
              ? ''
              : (stryCov_9fa48('2645'), 'neutral');
          clusters.push(
            stryMutAct_9fa48('2646')
              ? {}
              : (stryCov_9fa48('2646'),
                {
                  clusterId,
                  name: stryMutAct_9fa48('2647')
                    ? ``
                    : (stryCov_9fa48('2647'), `Cluster ${clusterId}`),
                  memberCount: interviews.length,
                  avgSentiment,
                  keyThemes: this.extractTopics(allContent),
                  representativeViewpoints: stryMutAct_9fa48('2648')
                    ? allContent
                    : (stryCov_9fa48('2648'), allContent.slice(0, 3)),
                })
          );
        }
      }
      return clusters;
    }
  }
  async getReportByInterviewId(interviewId: string) {
    if (stryMutAct_9fa48('2649')) {
      {
      }
    } else {
      stryCov_9fa48('2649');
      return this.prisma.analysisReport.findFirst(
        stryMutAct_9fa48('2650')
          ? {}
          : (stryCov_9fa48('2650'),
            {
              where: stryMutAct_9fa48('2651')
                ? {}
                : (stryCov_9fa48('2651'),
                  {
                    interviewId,
                  }),
              orderBy: stryMutAct_9fa48('2652')
                ? {}
                : (stryCov_9fa48('2652'),
                  {
                    createdAt: stryMutAct_9fa48('2653') ? '' : (stryCov_9fa48('2653'), 'desc'),
                  }),
            })
      );
    }
  }
}
export const analysisService = new AnalysisService();
