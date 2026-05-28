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
import type { PrismaClient } from '@prisma/client';
import { error, info } from '../utils/logger.js';
export interface AnalyticsKPIs {
  totalInterviews: number;
  completionRate: number;
  averageDurationMinutes: number;
  totalReports: number;
}
export interface StatusDistribution {
  [status: string]: number;
}
export interface PlanCompletionRate {
  planId: string;
  planName: string;
  totalInterviews: number;
  completedCount: number;
  completionRate: number;
}
export interface WeeklyTrendEntry {
  week: string;
  count: number;
}
export class AnalyticsService {
  constructor(private prisma: PrismaClient) {}
  async getKPIs(): Promise<AnalyticsKPIs> {
    if (stryMutAct_9fa48('169')) {
      {
      }
    } else {
      stryCov_9fa48('169');
      try {
        if (stryMutAct_9fa48('170')) {
          {
          }
        } else {
          stryCov_9fa48('170');
          const [totalInterviews, completedCount, totalReports] = await Promise.all(
            stryMutAct_9fa48('171')
              ? []
              : (stryCov_9fa48('171'),
                [
                  this.prisma.interview.count(),
                  this.prisma.interview.count(
                    stryMutAct_9fa48('172')
                      ? {}
                      : (stryCov_9fa48('172'),
                        {
                          where: stryMutAct_9fa48('173')
                            ? {}
                            : (stryCov_9fa48('173'),
                              {
                                status: stryMutAct_9fa48('174')
                                  ? ''
                                  : (stryCov_9fa48('174'), 'COMPLETED'),
                              }),
                        })
                  ),
                  this.prisma.analysisReport.count(),
                ])
          );

          // Compute average duration from startedAt -> completedAt for completed interviews
          const completedInterviews = await this.prisma.interview.findMany(
            stryMutAct_9fa48('175')
              ? {}
              : (stryCov_9fa48('175'),
                {
                  where: stryMutAct_9fa48('176')
                    ? {}
                    : (stryCov_9fa48('176'),
                      {
                        status: stryMutAct_9fa48('177') ? '' : (stryCov_9fa48('177'), 'COMPLETED'),
                        startedAt: stryMutAct_9fa48('178')
                          ? {}
                          : (stryCov_9fa48('178'),
                            {
                              not: null,
                            }),
                        completedAt: stryMutAct_9fa48('179')
                          ? {}
                          : (stryCov_9fa48('179'),
                            {
                              not: null,
                            }),
                      }),
                  select: stryMutAct_9fa48('180')
                    ? {}
                    : (stryCov_9fa48('180'),
                      {
                        startedAt: stryMutAct_9fa48('181') ? false : (stryCov_9fa48('181'), true),
                        completedAt: stryMutAct_9fa48('182') ? false : (stryCov_9fa48('182'), true),
                      }),
                })
          );
          let totalMinutes = 0;
          let durationCount = 0;
          for (const interview of completedInterviews) {
            if (stryMutAct_9fa48('183')) {
              {
              }
            } else {
              stryCov_9fa48('183');
              if (
                stryMutAct_9fa48('186')
                  ? interview.startedAt || interview.completedAt
                  : stryMutAct_9fa48('185')
                    ? false
                    : stryMutAct_9fa48('184')
                      ? true
                      : (stryCov_9fa48('184', '185', '186'),
                        interview.startedAt && interview.completedAt)
              ) {
                if (stryMutAct_9fa48('187')) {
                  {
                  }
                } else {
                  stryCov_9fa48('187');
                  const diffMs = stryMutAct_9fa48('188')
                    ? interview.completedAt.getTime() + interview.startedAt.getTime()
                    : (stryCov_9fa48('188'),
                      interview.completedAt.getTime() - interview.startedAt.getTime());
                  stryMutAct_9fa48('189')
                    ? (totalMinutes -= diffMs / (1000 * 60))
                    : (stryCov_9fa48('189'),
                      (totalMinutes += stryMutAct_9fa48('190')
                        ? diffMs * (1000 * 60)
                        : (stryCov_9fa48('190'),
                          diffMs /
                            (stryMutAct_9fa48('191')
                              ? 1000 / 60
                              : (stryCov_9fa48('191'), 1000 * 60)))));
                  stryMutAct_9fa48('192')
                    ? durationCount--
                    : (stryCov_9fa48('192'), durationCount++);
                }
              }
            }
          }
          const averageDurationMinutes = (
            stryMutAct_9fa48('196')
              ? durationCount <= 0
              : stryMutAct_9fa48('195')
                ? durationCount >= 0
                : stryMutAct_9fa48('194')
                  ? false
                  : stryMutAct_9fa48('193')
                    ? true
                    : (stryCov_9fa48('193', '194', '195', '196'), durationCount > 0)
          )
            ? Math.round(
                stryMutAct_9fa48('197')
                  ? totalMinutes * durationCount
                  : (stryCov_9fa48('197'), totalMinutes / durationCount)
              )
            : 0;
          const completionRate = (
            stryMutAct_9fa48('201')
              ? totalInterviews <= 0
              : stryMutAct_9fa48('200')
                ? totalInterviews >= 0
                : stryMutAct_9fa48('199')
                  ? false
                  : stryMutAct_9fa48('198')
                    ? true
                    : (stryCov_9fa48('198', '199', '200', '201'), totalInterviews > 0)
          )
            ? Math.round(
                stryMutAct_9fa48('202')
                  ? completedCount / totalInterviews / 100
                  : (stryCov_9fa48('202'),
                    (stryMutAct_9fa48('203')
                      ? completedCount * totalInterviews
                      : (stryCov_9fa48('203'), completedCount / totalInterviews)) * 100)
              )
            : 0;
          info(
            stryMutAct_9fa48('204') ? '' : (stryCov_9fa48('204'), 'KPIs computed'),
            stryMutAct_9fa48('205')
              ? {}
              : (stryCov_9fa48('205'),
                {
                  totalInterviews,
                  completionRate,
                  averageDurationMinutes,
                  totalReports,
                })
          );
          return stryMutAct_9fa48('206')
            ? {}
            : (stryCov_9fa48('206'),
              {
                totalInterviews,
                completionRate,
                averageDurationMinutes,
                totalReports,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('207')) {
          {
          }
        } else {
          stryCov_9fa48('207');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('208')
                ? ''
                : (stryCov_9fa48('208'), 'Failed to compute KPIs');
          error(
            stryMutAct_9fa48('209')
              ? ''
              : (stryCov_9fa48('209'), 'Failed to compute analytics KPIs'),
            stryMutAct_9fa48('210')
              ? {}
              : (stryCov_9fa48('210'),
                {
                  error: errMsg,
                })
          );
          throw e;
        }
      }
    }
  }
  async getStatusDistribution(): Promise<StatusDistribution> {
    if (stryMutAct_9fa48('211')) {
      {
      }
    } else {
      stryCov_9fa48('211');
      try {
        if (stryMutAct_9fa48('212')) {
          {
          }
        } else {
          stryCov_9fa48('212');
          const groups = await this.prisma.interview.groupBy(
            stryMutAct_9fa48('213')
              ? {}
              : (stryCov_9fa48('213'),
                {
                  by: stryMutAct_9fa48('214')
                    ? []
                    : (stryCov_9fa48('214'),
                      [stryMutAct_9fa48('215') ? '' : (stryCov_9fa48('215'), 'status')]),
                  _count: stryMutAct_9fa48('216') ? false : (stryCov_9fa48('216'), true),
                })
          );
          const result: StatusDistribution = {};
          for (const group of groups) {
            if (stryMutAct_9fa48('217')) {
              {
              }
            } else {
              stryCov_9fa48('217');
              result[group.status] = group._count as number;
            }
          }

          // Ensure all statuses are present (even with 0 count)
          const allStatuses = stryMutAct_9fa48('218')
            ? []
            : (stryCov_9fa48('218'),
              [
                stryMutAct_9fa48('219') ? '' : (stryCov_9fa48('219'), 'PENDING'),
                stryMutAct_9fa48('220') ? '' : (stryCov_9fa48('220'), 'ACTIVE'),
                stryMutAct_9fa48('221') ? '' : (stryCov_9fa48('221'), 'WAITING'),
                stryMutAct_9fa48('222') ? '' : (stryCov_9fa48('222'), 'COMPLETED'),
                stryMutAct_9fa48('223') ? '' : (stryCov_9fa48('223'), 'CANCELLED'),
              ]);
          for (const status of allStatuses) {
            if (stryMutAct_9fa48('224')) {
              {
              }
            } else {
              stryCov_9fa48('224');
              if (
                stryMutAct_9fa48('227')
                  ? false
                  : stryMutAct_9fa48('226')
                    ? true
                    : stryMutAct_9fa48('225')
                      ? status in result
                      : (stryCov_9fa48('225', '226', '227'), !(status in result))
              ) {
                if (stryMutAct_9fa48('228')) {
                  {
                  }
                } else {
                  stryCov_9fa48('228');
                  result[status] = 0;
                }
              }
            }
          }
          return result;
        }
      } catch (e) {
        if (stryMutAct_9fa48('229')) {
          {
          }
        } else {
          stryCov_9fa48('229');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('230')
                ? ''
                : (stryCov_9fa48('230'), 'Failed to compute status distribution');
          error(
            stryMutAct_9fa48('231')
              ? ''
              : (stryCov_9fa48('231'), 'Failed to compute status distribution'),
            stryMutAct_9fa48('232')
              ? {}
              : (stryCov_9fa48('232'),
                {
                  error: errMsg,
                })
          );
          throw e;
        }
      }
    }
  }
  async getPlanCompletionRates(): Promise<PlanCompletionRate[]> {
    if (stryMutAct_9fa48('233')) {
      {
      }
    } else {
      stryCov_9fa48('233');
      try {
        if (stryMutAct_9fa48('234')) {
          {
          }
        } else {
          stryCov_9fa48('234');
          const plans = await this.prisma.interviewPlan.findMany(
            stryMutAct_9fa48('235')
              ? {}
              : (stryCov_9fa48('235'),
                {
                  select: stryMutAct_9fa48('236')
                    ? {}
                    : (stryCov_9fa48('236'),
                      {
                        id: stryMutAct_9fa48('237') ? false : (stryCov_9fa48('237'), true),
                        name: stryMutAct_9fa48('238') ? false : (stryCov_9fa48('238'), true),
                        _count: stryMutAct_9fa48('239')
                          ? {}
                          : (stryCov_9fa48('239'),
                            {
                              select: stryMutAct_9fa48('240')
                                ? {}
                                : (stryCov_9fa48('240'),
                                  {
                                    interviews: stryMutAct_9fa48('241')
                                      ? false
                                      : (stryCov_9fa48('241'), true),
                                  }),
                            }),
                        interviews: stryMutAct_9fa48('242')
                          ? {}
                          : (stryCov_9fa48('242'),
                            {
                              select: stryMutAct_9fa48('243')
                                ? {}
                                : (stryCov_9fa48('243'),
                                  {
                                    status: stryMutAct_9fa48('244')
                                      ? false
                                      : (stryCov_9fa48('244'), true),
                                  }),
                            }),
                      }),
                  orderBy: stryMutAct_9fa48('245')
                    ? {}
                    : (stryCov_9fa48('245'),
                      {
                        createdAt: stryMutAct_9fa48('246') ? '' : (stryCov_9fa48('246'), 'desc'),
                      }),
                })
          );
          const result: PlanCompletionRate[] = plans.map((plan) => {
            if (stryMutAct_9fa48('247')) {
              {
              }
            } else {
              stryCov_9fa48('247');
              const totalInterviews = plan._count.interviews;
              const completedCount = stryMutAct_9fa48('248')
                ? plan.interviews.length
                : (stryCov_9fa48('248'),
                  plan.interviews.filter(
                    stryMutAct_9fa48('249')
                      ? () => undefined
                      : (stryCov_9fa48('249'),
                        (i) =>
                          stryMutAct_9fa48('252')
                            ? i.status !== 'COMPLETED'
                            : stryMutAct_9fa48('251')
                              ? false
                              : stryMutAct_9fa48('250')
                                ? true
                                : (stryCov_9fa48('250', '251', '252'),
                                  i.status ===
                                    (stryMutAct_9fa48('253')
                                      ? ''
                                      : (stryCov_9fa48('253'), 'COMPLETED'))))
                  ).length);
              const completionRate = (
                stryMutAct_9fa48('257')
                  ? totalInterviews <= 0
                  : stryMutAct_9fa48('256')
                    ? totalInterviews >= 0
                    : stryMutAct_9fa48('255')
                      ? false
                      : stryMutAct_9fa48('254')
                        ? true
                        : (stryCov_9fa48('254', '255', '256', '257'), totalInterviews > 0)
              )
                ? Math.round(
                    stryMutAct_9fa48('258')
                      ? completedCount / totalInterviews / 100
                      : (stryCov_9fa48('258'),
                        (stryMutAct_9fa48('259')
                          ? completedCount * totalInterviews
                          : (stryCov_9fa48('259'), completedCount / totalInterviews)) * 100)
                  )
                : 0;
              return stryMutAct_9fa48('260')
                ? {}
                : (stryCov_9fa48('260'),
                  {
                    planId: plan.id,
                    planName: plan.name,
                    totalInterviews,
                    completedCount,
                    completionRate,
                  });
            }
          });
          return result;
        }
      } catch (e) {
        if (stryMutAct_9fa48('261')) {
          {
          }
        } else {
          stryCov_9fa48('261');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('262')
                ? ''
                : (stryCov_9fa48('262'), 'Failed to compute plan completion rates');
          error(
            stryMutAct_9fa48('263')
              ? ''
              : (stryCov_9fa48('263'), 'Failed to compute plan completion rates'),
            stryMutAct_9fa48('264')
              ? {}
              : (stryCov_9fa48('264'),
                {
                  error: errMsg,
                })
          );
          throw e;
        }
      }
    }
  }
  async getWeeklyTrend(): Promise<WeeklyTrendEntry[]> {
    if (stryMutAct_9fa48('265')) {
      {
      }
    } else {
      stryCov_9fa48('265');
      try {
        if (stryMutAct_9fa48('266')) {
          {
          }
        } else {
          stryCov_9fa48('266');
          const now = new Date();
          const eightWeeksAgo = new Date(now);
          stryMutAct_9fa48('267')
            ? eightWeeksAgo.setTime(eightWeeksAgo.getDate() - 8 * 7)
            : (stryCov_9fa48('267'),
              eightWeeksAgo.setDate(
                stryMutAct_9fa48('268')
                  ? eightWeeksAgo.getDate() + 8 * 7
                  : (stryCov_9fa48('268'),
                    eightWeeksAgo.getDate() -
                      (stryMutAct_9fa48('269') ? 8 / 7 : (stryCov_9fa48('269'), 8 * 7)))
              ));
          const completedInterviews = await this.prisma.interview.findMany(
            stryMutAct_9fa48('270')
              ? {}
              : (stryCov_9fa48('270'),
                {
                  where: stryMutAct_9fa48('271')
                    ? {}
                    : (stryCov_9fa48('271'),
                      {
                        status: stryMutAct_9fa48('272') ? '' : (stryCov_9fa48('272'), 'COMPLETED'),
                        completedAt: stryMutAct_9fa48('273')
                          ? {}
                          : (stryCov_9fa48('273'),
                            {
                              gte: eightWeeksAgo,
                            }),
                      }),
                  select: stryMutAct_9fa48('274')
                    ? {}
                    : (stryCov_9fa48('274'),
                      {
                        completedAt: stryMutAct_9fa48('275') ? false : (stryCov_9fa48('275'), true),
                      }),
                  orderBy: stryMutAct_9fa48('276')
                    ? {}
                    : (stryCov_9fa48('276'),
                      {
                        completedAt: stryMutAct_9fa48('277') ? '' : (stryCov_9fa48('277'), 'asc'),
                      }),
                })
          );

          // Group by week
          const weekMap = new Map<string, number>();

          // Initialize all 8 weeks
          for (
            let i = 7;
            stryMutAct_9fa48('280')
              ? i < 0
              : stryMutAct_9fa48('279')
                ? i > 0
                : stryMutAct_9fa48('278')
                  ? false
                  : (stryCov_9fa48('278', '279', '280'), i >= 0);
            stryMutAct_9fa48('281') ? i++ : (stryCov_9fa48('281'), i--)
          ) {
            if (stryMutAct_9fa48('282')) {
              {
              }
            } else {
              stryCov_9fa48('282');
              const weekStart = new Date(now);
              stryMutAct_9fa48('283')
                ? weekStart.setTime(weekStart.getDate() - i * 7)
                : (stryCov_9fa48('283'),
                  weekStart.setDate(
                    stryMutAct_9fa48('284')
                      ? weekStart.getDate() + i * 7
                      : (stryCov_9fa48('284'),
                        weekStart.getDate() -
                          (stryMutAct_9fa48('285') ? i / 7 : (stryCov_9fa48('285'), i * 7)))
                  ));
              const weekKey = this.getWeekKey(weekStart);
              weekMap.set(weekKey, 0);
            }
          }
          for (const interview of completedInterviews) {
            if (stryMutAct_9fa48('286')) {
              {
              }
            } else {
              stryCov_9fa48('286');
              if (
                stryMutAct_9fa48('288')
                  ? false
                  : stryMutAct_9fa48('287')
                    ? true
                    : (stryCov_9fa48('287', '288'), interview.completedAt)
              ) {
                if (stryMutAct_9fa48('289')) {
                  {
                  }
                } else {
                  stryCov_9fa48('289');
                  const weekKey = this.getWeekKey(interview.completedAt);
                  weekMap.set(
                    weekKey,
                    stryMutAct_9fa48('290')
                      ? (weekMap.get(weekKey) ?? 0) - 1
                      : (stryCov_9fa48('290'),
                        (stryMutAct_9fa48('291')
                          ? weekMap.get(weekKey) && 0
                          : (stryCov_9fa48('291'), weekMap.get(weekKey) ?? 0)) + 1)
                  );
                }
              }
            }
          }
          const result: WeeklyTrendEntry[] = stryMutAct_9fa48('292')
            ? ['Stryker was here']
            : (stryCov_9fa48('292'), []);
          for (const [week, count] of weekMap.entries()) {
            if (stryMutAct_9fa48('293')) {
              {
              }
            } else {
              stryCov_9fa48('293');
              result.push(
                stryMutAct_9fa48('294')
                  ? {}
                  : (stryCov_9fa48('294'),
                    {
                      week,
                      count,
                    })
              );
            }
          }
          return result;
        }
      } catch (e) {
        if (stryMutAct_9fa48('295')) {
          {
          }
        } else {
          stryCov_9fa48('295');
          const errMsg =
            e instanceof Error
              ? e.message
              : stryMutAct_9fa48('296')
                ? ''
                : (stryCov_9fa48('296'), 'Failed to compute weekly trend');
          error(
            stryMutAct_9fa48('297') ? '' : (stryCov_9fa48('297'), 'Failed to compute weekly trend'),
            stryMutAct_9fa48('298')
              ? {}
              : (stryCov_9fa48('298'),
                {
                  error: errMsg,
                })
          );
          throw e;
        }
      }
    }
  }
  private getWeekKey(date: Date): string {
    if (stryMutAct_9fa48('299')) {
      {
      }
    } else {
      stryCov_9fa48('299');
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDays = Math.floor(
        stryMutAct_9fa48('300')
          ? (date.getTime() - startOfYear.getTime()) * (1000 * 60 * 60 * 24)
          : (stryCov_9fa48('300'),
            (stryMutAct_9fa48('301')
              ? date.getTime() + startOfYear.getTime()
              : (stryCov_9fa48('301'), date.getTime() - startOfYear.getTime())) /
              (stryMutAct_9fa48('302')
                ? (1000 * 60 * 60) / 24
                : (stryCov_9fa48('302'),
                  (stryMutAct_9fa48('303')
                    ? (1000 * 60) / 60
                    : (stryCov_9fa48('303'),
                      (stryMutAct_9fa48('304') ? 1000 / 60 : (stryCov_9fa48('304'), 1000 * 60)) *
                        60)) * 24)))
      );
      const weekNum = Math.ceil(
        stryMutAct_9fa48('305')
          ? (pastDays + startOfYear.getDay() + 1) * 7
          : (stryCov_9fa48('305'),
            (stryMutAct_9fa48('306')
              ? pastDays + startOfYear.getDay() - 1
              : (stryCov_9fa48('306'),
                (stryMutAct_9fa48('307')
                  ? pastDays - startOfYear.getDay()
                  : (stryCov_9fa48('307'), pastDays + startOfYear.getDay())) + 1)) / 7)
      );
      return stryMutAct_9fa48('308')
        ? ``
        : (stryCov_9fa48('308'),
          `${date.getFullYear()}-W${String(weekNum).padStart(2, stryMutAct_9fa48('309') ? '' : (stryCov_9fa48('309'), '0'))}`);
    }
  }
}
