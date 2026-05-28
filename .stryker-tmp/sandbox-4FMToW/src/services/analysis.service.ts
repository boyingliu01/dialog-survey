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
    if (stryMutAct_9fa48('0')) {
      {
      }
    } else {
      stryCov_9fa48('0');
      this._prisma = stryMutAct_9fa48('1')
        ? prisma && new PrismaClient()
        : (stryCov_9fa48('1'), prisma ?? new PrismaClient());
    }
  }
  get prisma(): PrismaClient {
    if (stryMutAct_9fa48('2')) {
      {
      }
    } else {
      stryCov_9fa48('2');
      return this._prisma;
    }
  }
  async analyzeInterview(interviewId: string): Promise<AnalysisResult> {
    if (stryMutAct_9fa48('3')) {
      {
      }
    } else {
      stryCov_9fa48('3');
      const interview = await this.prisma.interview.findUnique(
        stryMutAct_9fa48('4')
          ? {}
          : (stryCov_9fa48('4'),
            {
              where: stryMutAct_9fa48('5')
                ? {}
                : (stryCov_9fa48('5'),
                  {
                    id: interviewId,
                  }),
              include: stryMutAct_9fa48('6')
                ? {}
                : (stryCov_9fa48('6'),
                  {
                    responses: stryMutAct_9fa48('7') ? false : (stryCov_9fa48('7'), true),
                    messages: stryMutAct_9fa48('8') ? false : (stryCov_9fa48('8'), true),
                  }),
            })
      );
      if (
        stryMutAct_9fa48('11')
          ? false
          : stryMutAct_9fa48('10')
            ? true
            : stryMutAct_9fa48('9')
              ? interview
              : (stryCov_9fa48('9', '10', '11'), !interview)
      ) {
        if (stryMutAct_9fa48('12')) {
          {
          }
        } else {
          stryCov_9fa48('12');
          throw new Error(
            stryMutAct_9fa48('13') ? '' : (stryCov_9fa48('13'), 'Interview not found')
          );
        }
      }
      const qaPairs = interview.responses.map(
        stryMutAct_9fa48('14')
          ? () => undefined
          : (stryCov_9fa48('14'),
            (r) =>
              stryMutAct_9fa48('15')
                ? {}
                : (stryCov_9fa48('15'),
                  {
                    question: r.questionId,
                    answer: r.content,
                  }))
      );
      const topic = interview.templateId;
      const report = await generateReport(interviewId, topic, qaPairs);
      const metrics = this.calculateMetrics(interview.responses);
      let dimResult: ReportWithDimensions = stryMutAct_9fa48('16')
        ? {}
        : (stryCov_9fa48('16'),
          {
            interviewId,
            content: stryMutAct_9fa48('17') ? 'Stryker was here!' : (stryCov_9fa48('17'), ''),
            keyFindings: stryMutAct_9fa48('18') ? ['Stryker was here'] : (stryCov_9fa48('18'), []),
            sentiment: stryMutAct_9fa48('19') ? 'Stryker was here!' : (stryCov_9fa48('19'), ''),
            recommendations: stryMutAct_9fa48('20')
              ? ['Stryker was here']
              : (stryCov_9fa48('20'), []),
            generatedAt: new Date(),
            dimensionTags: stryMutAct_9fa48('21')
              ? ['Stryker was here']
              : (stryCov_9fa48('21'), []),
            emergentTags: stryMutAct_9fa48('22') ? ['Stryker was here'] : (stryCov_9fa48('22'), []),
          });
      try {
        if (stryMutAct_9fa48('23')) {
          {
          }
        } else {
          stryCov_9fa48('23');
          const template = await this.prisma.template.findUnique(
            stryMutAct_9fa48('24')
              ? {}
              : (stryCov_9fa48('24'),
                {
                  where: stryMutAct_9fa48('25')
                    ? {}
                    : (stryCov_9fa48('25'),
                      {
                        id: interview.templateId,
                      }),
                })
          );
          const dimsJson = (
            stryMutAct_9fa48('26')
              ? template.dimensions
              : (stryCov_9fa48('26'), template?.dimensions)
          )
            ? JSON.stringify(template.dimensions)
            : null;
          if (
            stryMutAct_9fa48('28')
              ? false
              : stryMutAct_9fa48('27')
                ? true
                : (stryCov_9fa48('27', '28'), dimsJson)
          ) {
            if (stryMutAct_9fa48('29')) {
              {
              }
            } else {
              stryCov_9fa48('29');
              const { VolcengineLLM } = await import('../integrations/llm/volcengine.js');
              const llm = VolcengineLLM.fromEnv();
              dimResult = await generateReportWithDimensions(
                interviewId,
                topic,
                qaPairs,
                dimsJson,
                llm
              );
              dimResult.dimensionTags = stryMutAct_9fa48('30')
                ? dimResult.dimensionTags.map((tag) => ({
                    ...tag,
                    quotes: tag.quotes.map((q: string) => anonymizePII(q)),
                  }))
                : (stryCov_9fa48('30'),
                  dimResult.dimensionTags?.map(
                    stryMutAct_9fa48('31')
                      ? () => undefined
                      : (stryCov_9fa48('31'),
                        (tag) =>
                          stryMutAct_9fa48('32')
                            ? {}
                            : (stryCov_9fa48('32'),
                              {
                                ...tag,
                                quotes: tag.quotes.map(
                                  stryMutAct_9fa48('33')
                                    ? () => undefined
                                    : (stryCov_9fa48('33'), (q: string) => anonymizePII(q))
                                ),
                              }))
                  ));
            }
          }
        }
      } catch (e) {
        if (stryMutAct_9fa48('34')) {
          {
          }
        } else {
          stryCov_9fa48('34');
          error(
            stryMutAct_9fa48('35') ? '' : (stryCov_9fa48('35'), 'Dimension analysis failed'),
            stryMutAct_9fa48('36')
              ? {}
              : (stryCov_9fa48('36'),
                {
                  interviewId,
                  error: e instanceof Error ? e.message : String(e),
                })
          );
          await recordAnalysisFailure(
            interviewId,
            stryMutAct_9fa48('37') ? '' : (stryCov_9fa48('37'), 'DIMENSION_ANALYSIS_FAILED'),
            e instanceof Error ? e.message : String(e)
          );
        }
      }
      await this.prisma.analysisReport.create(
        stryMutAct_9fa48('38')
          ? {}
          : (stryCov_9fa48('38'),
            {
              data: stryMutAct_9fa48('39')
                ? {}
                : (stryCov_9fa48('39'),
                  {
                    interviewId,
                    content: report.content,
                    keyFindings: report.keyFindings,
                    sentiment: report.sentiment,
                    recommendations: report.recommendations,
                    dimensionTags: (
                      stryMutAct_9fa48('40')
                        ? dimResult.dimensionTags.length
                        : (stryCov_9fa48('40'), dimResult.dimensionTags?.length)
                    )
                      ? dimResult.dimensionTags
                      : undefined,
                    emergentTags: (
                      stryMutAct_9fa48('41')
                        ? dimResult.emergentTags.length
                        : (stryCov_9fa48('41'), dimResult.emergentTags?.length)
                    )
                      ? dimResult.emergentTags
                      : undefined,
                    interviewerRating: stryMutAct_9fa48('42')
                      ? dimResult.interviewerRating && undefined
                      : (stryCov_9fa48('42'), dimResult.interviewerRating ?? undefined),
                  }),
            })
      );
      return stryMutAct_9fa48('43')
        ? {}
        : (stryCov_9fa48('43'),
          {
            interviewId,
            report,
            metrics,
          });
    }
  }
  async batchAnalyze(planId: string): Promise<AnalysisResult[]> {
    if (stryMutAct_9fa48('44')) {
      {
      }
    } else {
      stryCov_9fa48('44');
      const interviews = await this.prisma.interview.findMany(
        stryMutAct_9fa48('45')
          ? {}
          : (stryCov_9fa48('45'),
            {
              where: stryMutAct_9fa48('46')
                ? {}
                : (stryCov_9fa48('46'),
                  {
                    planId,
                    status: stryMutAct_9fa48('47') ? '' : (stryCov_9fa48('47'), 'COMPLETED'),
                  }),
            })
      );
      info(
        stryMutAct_9fa48('48') ? '' : (stryCov_9fa48('48'), 'Batch analyzing interviews'),
        stryMutAct_9fa48('49')
          ? {}
          : (stryCov_9fa48('49'),
            {
              planId,
              count: interviews.length,
            })
      );
      const results: AnalysisResult[] = stryMutAct_9fa48('50')
        ? ['Stryker was here']
        : (stryCov_9fa48('50'), []);
      for (const interview of interviews) {
        if (stryMutAct_9fa48('51')) {
          {
          }
        } else {
          stryCov_9fa48('51');
          try {
            if (stryMutAct_9fa48('52')) {
              {
              }
            } else {
              stryCov_9fa48('52');
              const result = await this.analyzeInterview(interview.id);
              results.push(result);
            }
          } catch (e) {
            if (stryMutAct_9fa48('53')) {
              {
              }
            } else {
              stryCov_9fa48('53');
              info(
                stryMutAct_9fa48('54') ? '' : (stryCov_9fa48('54'), 'Failed to analyze interview'),
                stryMutAct_9fa48('55')
                  ? {}
                  : (stryCov_9fa48('55'),
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
    if (stryMutAct_9fa48('56')) {
      {
      }
    } else {
      stryCov_9fa48('56');
      const totalResponses = responses.length;
      const avgResponseLength = (
        stryMutAct_9fa48('60')
          ? totalResponses <= 0
          : stryMutAct_9fa48('59')
            ? totalResponses >= 0
            : stryMutAct_9fa48('58')
              ? false
              : stryMutAct_9fa48('57')
                ? true
                : (stryCov_9fa48('57', '58', '59', '60'), totalResponses > 0)
      )
        ? stryMutAct_9fa48('61')
          ? responses.reduce((sum, r) => sum + r.content.length, 0) * totalResponses
          : (stryCov_9fa48('61'),
            responses.reduce(
              stryMutAct_9fa48('62')
                ? () => undefined
                : (stryCov_9fa48('62'),
                  (sum, r) =>
                    stryMutAct_9fa48('63')
                      ? sum - r.content.length
                      : (stryCov_9fa48('63'), sum + r.content.length)),
              0
            ) / totalResponses)
        : 0;
      const followupDepth = stryMutAct_9fa48('64')
        ? Math.min(...responses.map((r) => r.followupDepth), 0)
        : (stryCov_9fa48('64'),
          Math.max(
            ...responses.map(
              stryMutAct_9fa48('65')
                ? () => undefined
                : (stryCov_9fa48('65'), (r) => r.followupDepth)
            ),
            0
          ));
      const completionRate = (
        stryMutAct_9fa48('69')
          ? totalResponses <= 0
          : stryMutAct_9fa48('68')
            ? totalResponses >= 0
            : stryMutAct_9fa48('67')
              ? false
              : stryMutAct_9fa48('66')
                ? true
                : (stryCov_9fa48('66', '67', '68', '69'), totalResponses > 0)
      )
        ? 1
        : 0;
      const sentiment = this.analyzeSentiment(
        responses.map(
          stryMutAct_9fa48('70') ? () => undefined : (stryCov_9fa48('70'), (r) => r.content)
        )
      );
      return stryMutAct_9fa48('71')
        ? {}
        : (stryCov_9fa48('71'),
          {
            totalResponses,
            avgResponseLength: Math.round(avgResponseLength),
            followupDepth,
            completionRate,
            sentiment,
            topicCoverage: this.extractTopics(
              responses.map(
                stryMutAct_9fa48('72') ? () => undefined : (stryCov_9fa48('72'), (r) => r.content)
              )
            ),
          });
    }
  }
  private analyzeSentiment(contents: string[]): string {
    if (stryMutAct_9fa48('73')) {
      {
      }
    } else {
      stryCov_9fa48('73');
      const positiveWords = stryMutAct_9fa48('74')
        ? []
        : (stryCov_9fa48('74'),
          [
            stryMutAct_9fa48('75') ? '' : (stryCov_9fa48('75'), '好'),
            stryMutAct_9fa48('76') ? '' : (stryCov_9fa48('76'), '喜欢'),
            stryMutAct_9fa48('77') ? '' : (stryCov_9fa48('77'), '优秀'),
            stryMutAct_9fa48('78') ? '' : (stryCov_9fa48('78'), '满意'),
            stryMutAct_9fa48('79') ? '' : (stryCov_9fa48('79'), '棒'),
            stryMutAct_9fa48('80') ? '' : (stryCov_9fa48('80'), '感谢'),
            stryMutAct_9fa48('81') ? '' : (stryCov_9fa48('81'), 'great'),
            stryMutAct_9fa48('82') ? '' : (stryCov_9fa48('82'), 'good'),
            stryMutAct_9fa48('83') ? '' : (stryCov_9fa48('83'), 'excellent'),
          ]);
      const negativeWords = stryMutAct_9fa48('84')
        ? []
        : (stryCov_9fa48('84'),
          [
            stryMutAct_9fa48('85') ? '' : (stryCov_9fa48('85'), '差'),
            stryMutAct_9fa48('86') ? '' : (stryCov_9fa48('86'), '不好'),
            stryMutAct_9fa48('87') ? '' : (stryCov_9fa48('87'), '失望'),
            stryMutAct_9fa48('88') ? '' : (stryCov_9fa48('88'), '糟糕'),
            stryMutAct_9fa48('89') ? '' : (stryCov_9fa48('89'), 'bad'),
            stryMutAct_9fa48('90') ? '' : (stryCov_9fa48('90'), 'poor'),
            stryMutAct_9fa48('91') ? '' : (stryCov_9fa48('91'), 'terrible'),
          ]);
      let score = 0;
      const text = stryMutAct_9fa48('92')
        ? contents.join('').toUpperCase()
        : (stryCov_9fa48('92'),
          contents
            .join(stryMutAct_9fa48('93') ? 'Stryker was here!' : (stryCov_9fa48('93'), ''))
            .toLowerCase());
      for (const word of positiveWords) {
        if (stryMutAct_9fa48('94')) {
          {
          }
        } else {
          stryCov_9fa48('94');
          if (
            stryMutAct_9fa48('96')
              ? false
              : stryMutAct_9fa48('95')
                ? true
                : (stryCov_9fa48('95', '96'), text.includes(word))
          )
            stryMutAct_9fa48('97') ? score-- : (stryCov_9fa48('97'), score++);
        }
      }
      for (const word of negativeWords) {
        if (stryMutAct_9fa48('98')) {
          {
          }
        } else {
          stryCov_9fa48('98');
          if (
            stryMutAct_9fa48('100')
              ? false
              : stryMutAct_9fa48('99')
                ? true
                : (stryCov_9fa48('99', '100'), text.includes(word))
          )
            stryMutAct_9fa48('101') ? score++ : (stryCov_9fa48('101'), score--);
        }
      }
      if (
        stryMutAct_9fa48('105')
          ? score <= 0
          : stryMutAct_9fa48('104')
            ? score >= 0
            : stryMutAct_9fa48('103')
              ? false
              : stryMutAct_9fa48('102')
                ? true
                : (stryCov_9fa48('102', '103', '104', '105'), score > 0)
      )
        return stryMutAct_9fa48('106') ? '' : (stryCov_9fa48('106'), 'positive');
      if (
        stryMutAct_9fa48('110')
          ? score >= 0
          : stryMutAct_9fa48('109')
            ? score <= 0
            : stryMutAct_9fa48('108')
              ? false
              : stryMutAct_9fa48('107')
                ? true
                : (stryCov_9fa48('107', '108', '109', '110'), score < 0)
      )
        return stryMutAct_9fa48('111') ? '' : (stryCov_9fa48('111'), 'negative');
      return stryMutAct_9fa48('112') ? '' : (stryCov_9fa48('112'), 'neutral');
    }
  }
  private extractTopics(contents: string[]): string[] {
    if (stryMutAct_9fa48('113')) {
      {
      }
    } else {
      stryCov_9fa48('113');
      const topics = new Set<string>();
      const keywords = stryMutAct_9fa48('114')
        ? []
        : (stryCov_9fa48('114'),
          [
            stryMutAct_9fa48('115') ? '' : (stryCov_9fa48('115'), '产品'),
            stryMutAct_9fa48('116') ? '' : (stryCov_9fa48('116'), '功能'),
            stryMutAct_9fa48('117') ? '' : (stryCov_9fa48('117'), '体验'),
            stryMutAct_9fa48('118') ? '' : (stryCov_9fa48('118'), '服务'),
            stryMutAct_9fa48('119') ? '' : (stryCov_9fa48('119'), '价格'),
            stryMutAct_9fa48('120') ? '' : (stryCov_9fa48('120'), '质量'),
            stryMutAct_9fa48('121') ? '' : (stryCov_9fa48('121'), '技术'),
            stryMutAct_9fa48('122') ? '' : (stryCov_9fa48('122'), '团队'),
            stryMutAct_9fa48('123') ? '' : (stryCov_9fa48('123'), '市场'),
          ]);
      const text = contents.join(
        stryMutAct_9fa48('124') ? 'Stryker was here!' : (stryCov_9fa48('124'), '')
      );
      for (const keyword of keywords) {
        if (stryMutAct_9fa48('125')) {
          {
          }
        } else {
          stryCov_9fa48('125');
          if (
            stryMutAct_9fa48('127')
              ? false
              : stryMutAct_9fa48('126')
                ? true
                : (stryCov_9fa48('126', '127'), text.includes(keyword))
          ) {
            if (stryMutAct_9fa48('128')) {
              {
              }
            } else {
              stryCov_9fa48('128');
              topics.add(keyword);
            }
          }
        }
      }
      return Array.from(topics);
    }
  }
  async compareClusters(clusterIds: string[]): Promise<ClusterAnalysis[]> {
    if (stryMutAct_9fa48('129')) {
      {
      }
    } else {
      stryCov_9fa48('129');
      const clusters: ClusterAnalysis[] = stryMutAct_9fa48('130')
        ? ['Stryker was here']
        : (stryCov_9fa48('130'), []);
      for (const clusterId of clusterIds) {
        if (stryMutAct_9fa48('131')) {
          {
          }
        } else {
          stryCov_9fa48('131');
          const interviews = await this.prisma.interview.findMany(
            stryMutAct_9fa48('132')
              ? {}
              : (stryCov_9fa48('132'),
                {
                  where: stryMutAct_9fa48('133')
                    ? {}
                    : (stryCov_9fa48('133'),
                      {
                        planId: clusterId,
                      }),
                  include: stryMutAct_9fa48('134')
                    ? {}
                    : (stryCov_9fa48('134'),
                      {
                        responses: stryMutAct_9fa48('135') ? false : (stryCov_9fa48('135'), true),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('138')
              ? interviews.length !== 0
              : stryMutAct_9fa48('137')
                ? false
                : stryMutAct_9fa48('136')
                  ? true
                  : (stryCov_9fa48('136', '137', '138'), interviews.length === 0)
          )
            continue;
          const allContent = interviews.flatMap(
            stryMutAct_9fa48('139')
              ? () => undefined
              : (stryCov_9fa48('139'),
                (i) =>
                  i.responses.map(
                    stryMutAct_9fa48('140')
                      ? () => undefined
                      : (stryCov_9fa48('140'), (r) => r.content)
                  ))
          );
          const sentiments = allContent.map(
            stryMutAct_9fa48('141')
              ? () => undefined
              : (stryCov_9fa48('141'),
                (c) =>
                  this.analyzeSentiment(stryMutAct_9fa48('142') ? [] : (stryCov_9fa48('142'), [c])))
          );
          const avgSentiment = (
            stryMutAct_9fa48('146')
              ? sentiments.filter((s) => s === 'positive').length <=
                sentiments.filter((s) => s === 'negative').length
              : stryMutAct_9fa48('145')
                ? sentiments.filter((s) => s === 'positive').length >=
                  sentiments.filter((s) => s === 'negative').length
                : stryMutAct_9fa48('144')
                  ? false
                  : stryMutAct_9fa48('143')
                    ? true
                    : (stryCov_9fa48('143', '144', '145', '146'),
                      (stryMutAct_9fa48('147')
                        ? sentiments.length
                        : (stryCov_9fa48('147'),
                          sentiments.filter(
                            stryMutAct_9fa48('148')
                              ? () => undefined
                              : (stryCov_9fa48('148'),
                                (s) =>
                                  stryMutAct_9fa48('151')
                                    ? s !== 'positive'
                                    : stryMutAct_9fa48('150')
                                      ? false
                                      : stryMutAct_9fa48('149')
                                        ? true
                                        : (stryCov_9fa48('149', '150', '151'),
                                          s ===
                                            (stryMutAct_9fa48('152')
                                              ? ''
                                              : (stryCov_9fa48('152'), 'positive'))))
                          ).length)) >
                        (stryMutAct_9fa48('153')
                          ? sentiments.length
                          : (stryCov_9fa48('153'),
                            sentiments.filter(
                              stryMutAct_9fa48('154')
                                ? () => undefined
                                : (stryCov_9fa48('154'),
                                  (s) =>
                                    stryMutAct_9fa48('157')
                                      ? s !== 'negative'
                                      : stryMutAct_9fa48('156')
                                        ? false
                                        : stryMutAct_9fa48('155')
                                          ? true
                                          : (stryCov_9fa48('155', '156', '157'),
                                            s ===
                                              (stryMutAct_9fa48('158')
                                                ? ''
                                                : (stryCov_9fa48('158'), 'negative'))))
                            ).length)))
          )
            ? stryMutAct_9fa48('159')
              ? ''
              : (stryCov_9fa48('159'), 'positive')
            : stryMutAct_9fa48('160')
              ? ''
              : (stryCov_9fa48('160'), 'neutral');
          clusters.push(
            stryMutAct_9fa48('161')
              ? {}
              : (stryCov_9fa48('161'),
                {
                  clusterId,
                  name: stryMutAct_9fa48('162')
                    ? ``
                    : (stryCov_9fa48('162'), `Cluster ${clusterId}`),
                  memberCount: interviews.length,
                  avgSentiment,
                  keyThemes: this.extractTopics(allContent),
                  representativeViewpoints: stryMutAct_9fa48('163')
                    ? allContent
                    : (stryCov_9fa48('163'), allContent.slice(0, 3)),
                })
          );
        }
      }
      return clusters;
    }
  }
  async getReportByInterviewId(interviewId: string) {
    if (stryMutAct_9fa48('164')) {
      {
      }
    } else {
      stryCov_9fa48('164');
      return this.prisma.analysisReport.findFirst(
        stryMutAct_9fa48('165')
          ? {}
          : (stryCov_9fa48('165'),
            {
              where: stryMutAct_9fa48('166')
                ? {}
                : (stryCov_9fa48('166'),
                  {
                    interviewId,
                  }),
              orderBy: stryMutAct_9fa48('167')
                ? {}
                : (stryCov_9fa48('167'),
                  {
                    createdAt: stryMutAct_9fa48('168') ? '' : (stryCov_9fa48('168'), 'desc'),
                  }),
            })
      );
    }
  }
}
export const analysisService = new AnalysisService();
