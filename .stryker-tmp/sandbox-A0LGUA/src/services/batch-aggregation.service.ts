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
export interface DimensionStat {
  dimensionId: string;
  label: string;
  mentionRate: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  totalMentions: number;
}
export interface DimensionStats {
  dimensions: DimensionStat[];
  totalInterviews: number;
}
export interface Checkpoint {
  completedStep: number;
  dimensionStats?: Record<string, DimensionStat>;
  topics?: Record<string, unknown>;
  emergents?: unknown[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PipelineStep<T extends unknown[] = unknown[], R = unknown> = (...args: T) => Promise<R>;
export function shouldSkipStep(
  checkpoint: Checkpoint | null | undefined,
  currentStep: number
): boolean {
  if (stryMutAct_9fa48('2714')) {
    {
    }
  } else {
    stryCov_9fa48('2714');
    if (
      stryMutAct_9fa48('2717')
        ? false
        : stryMutAct_9fa48('2716')
          ? true
          : stryMutAct_9fa48('2715')
            ? checkpoint
            : (stryCov_9fa48('2715', '2716', '2717'), !checkpoint)
    )
      return stryMutAct_9fa48('2718') ? true : (stryCov_9fa48('2718'), false);
    return stryMutAct_9fa48('2722')
      ? checkpoint.completedStep < currentStep
      : stryMutAct_9fa48('2721')
        ? checkpoint.completedStep > currentStep
        : stryMutAct_9fa48('2720')
          ? false
          : stryMutAct_9fa48('2719')
            ? true
            : (stryCov_9fa48('2719', '2720', '2721', '2722'),
              checkpoint.completedStep >= currentStep);
  }
}
export function createCheckpoint(step: number, data?: Record<string, unknown>): Checkpoint {
  if (stryMutAct_9fa48('2723')) {
    {
    }
  } else {
    stryCov_9fa48('2723');
    return stryMutAct_9fa48('2724')
      ? {}
      : (stryCov_9fa48('2724'),
        {
          completedStep: step,
          ...data,
        });
  }
}
export function computeDimensionStats(
  dimensionTags: Array<
    Array<{
      dimensionId: string;
      label: string;
      sentiment: string;
      quotes: string[];
    }>
  >,
  totalInterviews: number
): DimensionStats {
  if (stryMutAct_9fa48('2725')) {
    {
    }
  } else {
    stryCov_9fa48('2725');
    const dimensionMap = new Map<
      string,
      {
        label: string;
        sentiments: string[];
      }
    >();
    for (const tags of dimensionTags) {
      if (stryMutAct_9fa48('2726')) {
        {
        }
      } else {
        stryCov_9fa48('2726');
        const seenDimensions = new Set<string>();
        for (const tag of tags) {
          if (stryMutAct_9fa48('2727')) {
            {
            }
          } else {
            stryCov_9fa48('2727');
            if (
              stryMutAct_9fa48('2730')
                ? false
                : stryMutAct_9fa48('2729')
                  ? true
                  : stryMutAct_9fa48('2728')
                    ? seenDimensions.has(tag.dimensionId)
                    : (stryCov_9fa48('2728', '2729', '2730'), !seenDimensions.has(tag.dimensionId))
            ) {
              if (stryMutAct_9fa48('2731')) {
                {
                }
              } else {
                stryCov_9fa48('2731');
                seenDimensions.add(tag.dimensionId);
                const entry = stryMutAct_9fa48('2732')
                  ? dimensionMap.get(tag.dimensionId) && {
                      label: tag.label,
                      sentiments: [],
                    }
                  : (stryCov_9fa48('2732'),
                    dimensionMap.get(tag.dimensionId) ??
                      (stryMutAct_9fa48('2733')
                        ? {}
                        : (stryCov_9fa48('2733'),
                          {
                            label: tag.label,
                            sentiments: stryMutAct_9fa48('2734')
                              ? ['Stryker was here']
                              : (stryCov_9fa48('2734'), []),
                          })));
                if (
                  stryMutAct_9fa48('2737')
                    ? false
                    : stryMutAct_9fa48('2736')
                      ? true
                      : stryMutAct_9fa48('2735')
                        ? dimensionMap.has(tag.dimensionId)
                        : (stryCov_9fa48('2735', '2736', '2737'),
                          !dimensionMap.has(tag.dimensionId))
                ) {
                  if (stryMutAct_9fa48('2738')) {
                    {
                    }
                  } else {
                    stryCov_9fa48('2738');
                    dimensionMap.set(tag.dimensionId, entry);
                  }
                }
                entry.sentiments.push(tag.sentiment);
              }
            }
          }
        }
      }
    }
    const dimensions: DimensionStat[] = stryMutAct_9fa48('2739')
      ? ['Stryker was here']
      : (stryCov_9fa48('2739'), []);
    for (const [dimensionId, data] of dimensionMap) {
      if (stryMutAct_9fa48('2740')) {
        {
        }
      } else {
        stryCov_9fa48('2740');
        const mentionCount = data.sentiments.length;
        const positive = stryMutAct_9fa48('2741')
          ? data.sentiments.length
          : (stryCov_9fa48('2741'),
            data.sentiments.filter(
              stryMutAct_9fa48('2742')
                ? () => undefined
                : (stryCov_9fa48('2742'),
                  (s) =>
                    stryMutAct_9fa48('2745')
                      ? s !== 'positive'
                      : stryMutAct_9fa48('2744')
                        ? false
                        : stryMutAct_9fa48('2743')
                          ? true
                          : (stryCov_9fa48('2743', '2744', '2745'),
                            s ===
                              (stryMutAct_9fa48('2746')
                                ? ''
                                : (stryCov_9fa48('2746'), 'positive'))))
            ).length);
        const negative = stryMutAct_9fa48('2747')
          ? data.sentiments.length
          : (stryCov_9fa48('2747'),
            data.sentiments.filter(
              stryMutAct_9fa48('2748')
                ? () => undefined
                : (stryCov_9fa48('2748'),
                  (s) =>
                    stryMutAct_9fa48('2751')
                      ? s !== 'negative'
                      : stryMutAct_9fa48('2750')
                        ? false
                        : stryMutAct_9fa48('2749')
                          ? true
                          : (stryCov_9fa48('2749', '2750', '2751'),
                            s ===
                              (stryMutAct_9fa48('2752')
                                ? ''
                                : (stryCov_9fa48('2752'), 'negative'))))
            ).length);
        const neutral = stryMutAct_9fa48('2753')
          ? data.sentiments.length
          : (stryCov_9fa48('2753'),
            data.sentiments.filter(
              stryMutAct_9fa48('2754')
                ? () => undefined
                : (stryCov_9fa48('2754'),
                  (s) =>
                    stryMutAct_9fa48('2757')
                      ? s !== 'neutral'
                      : stryMutAct_9fa48('2756')
                        ? false
                        : stryMutAct_9fa48('2755')
                          ? true
                          : (stryCov_9fa48('2755', '2756', '2757'),
                            s ===
                              (stryMutAct_9fa48('2758') ? '' : (stryCov_9fa48('2758'), 'neutral'))))
            ).length);
        dimensions.push(
          stryMutAct_9fa48('2759')
            ? {}
            : (stryCov_9fa48('2759'),
              {
                dimensionId,
                label: data.label,
                mentionRate: (
                  stryMutAct_9fa48('2763')
                    ? totalInterviews <= 0
                    : stryMutAct_9fa48('2762')
                      ? totalInterviews >= 0
                      : stryMutAct_9fa48('2761')
                        ? false
                        : stryMutAct_9fa48('2760')
                          ? true
                          : (stryCov_9fa48('2760', '2761', '2762', '2763'), totalInterviews > 0)
                )
                  ? stryMutAct_9fa48('2764')
                    ? mentionCount * totalInterviews
                    : (stryCov_9fa48('2764'), mentionCount / totalInterviews)
                  : 0,
                sentimentBreakdown: stryMutAct_9fa48('2765')
                  ? {}
                  : (stryCov_9fa48('2765'),
                    {
                      positive: (
                        stryMutAct_9fa48('2769')
                          ? mentionCount <= 0
                          : stryMutAct_9fa48('2768')
                            ? mentionCount >= 0
                            : stryMutAct_9fa48('2767')
                              ? false
                              : stryMutAct_9fa48('2766')
                                ? true
                                : (stryCov_9fa48('2766', '2767', '2768', '2769'), mentionCount > 0)
                      )
                        ? stryMutAct_9fa48('2770')
                          ? positive * mentionCount
                          : (stryCov_9fa48('2770'), positive / mentionCount)
                        : 0,
                      negative: (
                        stryMutAct_9fa48('2774')
                          ? mentionCount <= 0
                          : stryMutAct_9fa48('2773')
                            ? mentionCount >= 0
                            : stryMutAct_9fa48('2772')
                              ? false
                              : stryMutAct_9fa48('2771')
                                ? true
                                : (stryCov_9fa48('2771', '2772', '2773', '2774'), mentionCount > 0)
                      )
                        ? stryMutAct_9fa48('2775')
                          ? negative * mentionCount
                          : (stryCov_9fa48('2775'), negative / mentionCount)
                        : 0,
                      neutral: (
                        stryMutAct_9fa48('2779')
                          ? mentionCount <= 0
                          : stryMutAct_9fa48('2778')
                            ? mentionCount >= 0
                            : stryMutAct_9fa48('2777')
                              ? false
                              : stryMutAct_9fa48('2776')
                                ? true
                                : (stryCov_9fa48('2776', '2777', '2778', '2779'), mentionCount > 0)
                      )
                        ? stryMutAct_9fa48('2780')
                          ? neutral * mentionCount
                          : (stryCov_9fa48('2780'), neutral / mentionCount)
                        : 0,
                    }),
                totalMentions: mentionCount,
              })
        );
      }
    }
    stryMutAct_9fa48('2781')
      ? dimensions
      : (stryCov_9fa48('2781'),
        dimensions.sort(
          stryMutAct_9fa48('2782')
            ? () => undefined
            : (stryCov_9fa48('2782'),
              (a, b) =>
                stryMutAct_9fa48('2783')
                  ? b.mentionRate + a.mentionRate
                  : (stryCov_9fa48('2783'), b.mentionRate - a.mentionRate))
        ));
    return stryMutAct_9fa48('2784')
      ? {}
      : (stryCov_9fa48('2784'),
        {
          dimensions,
          totalInterviews,
        });
  }
}
export async function executeWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  if (stryMutAct_9fa48('2785')) {
    {
    }
  } else {
    stryCov_9fa48('2785');
    const { default: pLimit } = await import('p-limit');
    const limiter = pLimit(limit);
    const jobs = tasks.map(
      stryMutAct_9fa48('2786') ? () => undefined : (stryCov_9fa48('2786'), (task) => limiter(task))
    );
    return Promise.all(jobs);
  }
}
const DEFAULT_TIMEOUT_MS = stryMutAct_9fa48('2787')
  ? (5 * 60) / 1000
  : (stryCov_9fa48('2787'),
    (stryMutAct_9fa48('2788') ? 5 / 60 : (stryCov_9fa48('2788'), 5 * 60)) * 1000);
export function runWithTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  if (stryMutAct_9fa48('2789')) {
    {
    }
  } else {
    stryCov_9fa48('2789');
    return new Promise((resolve, reject) => {
      if (stryMutAct_9fa48('2790')) {
        {
        }
      } else {
        stryCov_9fa48('2790');
        const timer = setTimeout(() => {
          if (stryMutAct_9fa48('2791')) {
            {
            }
          } else {
            stryCov_9fa48('2791');
            reject(
              new Error(
                stryMutAct_9fa48('2792')
                  ? ``
                  : (stryCov_9fa48('2792'), `Pipeline timeout after ${timeoutMs}ms`)
              )
            );
          }
        }, timeoutMs);
        task()
          .then((result) => {
            if (stryMutAct_9fa48('2793')) {
              {
              }
            } else {
              stryCov_9fa48('2793');
              clearTimeout(timer);
              resolve(result);
            }
          })
          .catch((err) => {
            if (stryMutAct_9fa48('2794')) {
              {
              }
            } else {
              stryCov_9fa48('2794');
              clearTimeout(timer);
              reject(err);
            }
          });
      }
    });
  }
}
