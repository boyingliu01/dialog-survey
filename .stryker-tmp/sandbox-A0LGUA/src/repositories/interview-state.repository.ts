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
import { InterviewStatus, PrismaClient } from '@prisma/client';
import type { InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';
export class StatePersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: 'VERSION_CONFLICT' | 'TRANSACTION_ERROR' | 'NOT_FOUND',
    public readonly retryable: boolean = stryMutAct_9fa48('1945')
      ? true
      : (stryCov_9fa48('1945'), false)
  ) {
    super(message);
    this.name = stryMutAct_9fa48('1946') ? '' : (stryCov_9fa48('1946'), 'StatePersistenceError');
  }
}
export interface SaveStateOptions {
  interviewId: string;
  state: InterviewState;
  version: number;
}
export interface LoadStateOptions {
  interviewId: string;
  userId: string;
}
const MAX_RETRIES = 3;
export class InterviewStateRepository {
  private prisma: PrismaClient;
  constructor(prisma?: PrismaClient) {
    if (stryMutAct_9fa48('1947')) {
      {
      }
    } else {
      stryCov_9fa48('1947');
      this.prisma = stryMutAct_9fa48('1950')
        ? prisma && new PrismaClient()
        : stryMutAct_9fa48('1949')
          ? false
          : stryMutAct_9fa48('1948')
            ? true
            : (stryCov_9fa48('1948', '1949', '1950'), prisma || new PrismaClient());
    }
  }

  /**
   * Save interview state with optimistic locking
   * Uses version field to prevent dirty writes
   */
  async saveState(options: SaveStateOptions, retryCount = 0): Promise<void> {
    if (stryMutAct_9fa48('1951')) {
      {
      }
    } else {
      stryCov_9fa48('1951');
      const { interviewId, state, version } = options;
      try {
        if (stryMutAct_9fa48('1952')) {
          {
          }
        } else {
          stryCov_9fa48('1952');
          await this.prisma.$transaction(async (tx) => {
            if (stryMutAct_9fa48('1953')) {
              {
              }
            } else {
              stryCov_9fa48('1953');
              // Check current version
              const interview = await tx.interview.findUnique(
                stryMutAct_9fa48('1954')
                  ? {}
                  : (stryCov_9fa48('1954'),
                    {
                      where: stryMutAct_9fa48('1955')
                        ? {}
                        : (stryCov_9fa48('1955'),
                          {
                            id: interviewId,
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('1958')
                  ? false
                  : stryMutAct_9fa48('1957')
                    ? true
                    : stryMutAct_9fa48('1956')
                      ? interview
                      : (stryCov_9fa48('1956', '1957', '1958'), !interview)
              ) {
                if (stryMutAct_9fa48('1959')) {
                  {
                  }
                } else {
                  stryCov_9fa48('1959');
                  throw new StatePersistenceError(
                    stryMutAct_9fa48('1960')
                      ? ``
                      : (stryCov_9fa48('1960'), `Interview not found: ${interviewId}`),
                    stryMutAct_9fa48('1961') ? '' : (stryCov_9fa48('1961'), 'NOT_FOUND'),
                    stryMutAct_9fa48('1962') ? true : (stryCov_9fa48('1962'), false)
                  );
                }
              }
              if (
                stryMutAct_9fa48('1965')
                  ? interview.version === version
                  : stryMutAct_9fa48('1964')
                    ? false
                    : stryMutAct_9fa48('1963')
                      ? true
                      : (stryCov_9fa48('1963', '1964', '1965'), interview.version !== version)
              ) {
                if (stryMutAct_9fa48('1966')) {
                  {
                  }
                } else {
                  stryCov_9fa48('1966');
                  throw new StatePersistenceError(
                    stryMutAct_9fa48('1967')
                      ? ``
                      : (stryCov_9fa48('1967'),
                        `Version conflict: expected ${version}, got ${interview.version}`),
                    stryMutAct_9fa48('1968') ? '' : (stryCov_9fa48('1968'), 'VERSION_CONFLICT'),
                    stryMutAct_9fa48('1969') ? false : (stryCov_9fa48('1969'), true)
                  );
                }
              }

              // Update state with version increment
              await tx.interview.update(
                stryMutAct_9fa48('1970')
                  ? {}
                  : (stryCov_9fa48('1970'),
                    {
                      where: stryMutAct_9fa48('1971')
                        ? {}
                        : (stryCov_9fa48('1971'),
                          {
                            id: interviewId,
                            version,
                          }),
                      data: stryMutAct_9fa48('1972')
                        ? {}
                        : (stryCov_9fa48('1972'),
                          {
                            status: state.status as InterviewStatus,
                            currentQuestion: state.currentQuestion,
                            followupCount: state.followupCount,
                            version: stryMutAct_9fa48('1973')
                              ? {}
                              : (stryCov_9fa48('1973'),
                                {
                                  increment: 1,
                                }),
                            messages: stryMutAct_9fa48('1974')
                              ? {}
                              : (stryCov_9fa48('1974'),
                                {
                                  deleteMany: stryMutAct_9fa48('1975')
                                    ? {}
                                    : (stryCov_9fa48('1975'),
                                      {
                                        interviewId,
                                      }),
                                  create: state.messages.map(
                                    stryMutAct_9fa48('1976')
                                      ? () => undefined
                                      : (stryCov_9fa48('1976'),
                                        (m) =>
                                          stryMutAct_9fa48('1977')
                                            ? {}
                                            : (stryCov_9fa48('1977'),
                                              {
                                                role: m.role,
                                                content: m.content,
                                                isVoice: stryMutAct_9fa48('1978')
                                                  ? true
                                                  : (stryCov_9fa48('1978'), false),
                                              }))
                                  ),
                                }),
                            responses: stryMutAct_9fa48('1979')
                              ? {}
                              : (stryCov_9fa48('1979'),
                                {
                                  deleteMany: stryMutAct_9fa48('1980')
                                    ? {}
                                    : (stryCov_9fa48('1980'),
                                      {
                                        interviewId,
                                      }),
                                  create: state.responses.map(
                                    stryMutAct_9fa48('1981')
                                      ? () => undefined
                                      : (stryCov_9fa48('1981'),
                                        (r) =>
                                          stryMutAct_9fa48('1982')
                                            ? {}
                                            : (stryCov_9fa48('1982'),
                                              {
                                                questionId: r.questionId,
                                                content: r.content,
                                                isFollowup: r.isFollowup,
                                              }))
                                  ),
                                }),
                          }),
                    })
              );
            }
          });
          info(
            stryMutAct_9fa48('1983') ? '' : (stryCov_9fa48('1983'), 'State saved successfully'),
            stryMutAct_9fa48('1984')
              ? {}
              : (stryCov_9fa48('1984'),
                {
                  interviewId,
                  version,
                })
          );
        }
      } catch (err) {
        if (stryMutAct_9fa48('1985')) {
          {
          }
        } else {
          stryCov_9fa48('1985');
          if (
            stryMutAct_9fa48('1987')
              ? false
              : stryMutAct_9fa48('1986')
                ? true
                : (stryCov_9fa48('1986', '1987'), err instanceof StatePersistenceError)
          ) {
            if (stryMutAct_9fa48('1988')) {
              {
              }
            } else {
              stryCov_9fa48('1988');
              if (
                stryMutAct_9fa48('1991')
                  ? err.retryable || retryCount < MAX_RETRIES
                  : stryMutAct_9fa48('1990')
                    ? false
                    : stryMutAct_9fa48('1989')
                      ? true
                      : (stryCov_9fa48('1989', '1990', '1991'),
                        err.retryable &&
                          (stryMutAct_9fa48('1994')
                            ? retryCount >= MAX_RETRIES
                            : stryMutAct_9fa48('1993')
                              ? retryCount <= MAX_RETRIES
                              : stryMutAct_9fa48('1992')
                                ? true
                                : (stryCov_9fa48('1992', '1993', '1994'),
                                  retryCount < MAX_RETRIES)))
              ) {
                if (stryMutAct_9fa48('1995')) {
                  {
                  }
                } else {
                  stryCov_9fa48('1995');
                  info(
                    stryMutAct_9fa48('1996') ? '' : (stryCov_9fa48('1996'), 'Retrying state save'),
                    stryMutAct_9fa48('1997')
                      ? {}
                      : (stryCov_9fa48('1997'),
                        {
                          interviewId,
                          retryCount: stryMutAct_9fa48('1998')
                            ? retryCount - 1
                            : (stryCov_9fa48('1998'), retryCount + 1),
                        })
                  );
                  return this.saveState(
                    options,
                    stryMutAct_9fa48('1999')
                      ? retryCount - 1
                      : (stryCov_9fa48('1999'), retryCount + 1)
                  );
                }
              }
              if (
                stryMutAct_9fa48('2002')
                  ? err.code !== 'VERSION_CONFLICT'
                  : stryMutAct_9fa48('2001')
                    ? false
                    : stryMutAct_9fa48('2000')
                      ? true
                      : (stryCov_9fa48('2000', '2001', '2002'),
                        err.code ===
                          (stryMutAct_9fa48('2003')
                            ? ''
                            : (stryCov_9fa48('2003'), 'VERSION_CONFLICT')))
              ) {
                if (stryMutAct_9fa48('2004')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2004');
                  error(
                    stryMutAct_9fa48('2005')
                      ? ''
                      : (stryCov_9fa48('2005'), 'Optimistic lock conflict'),
                    stryMutAct_9fa48('2006')
                      ? {}
                      : (stryCov_9fa48('2006'),
                        {
                          interviewId,
                          version,
                        })
                  );
                  throw err;
                }
              }
            }
          }
          error(
            stryMutAct_9fa48('2007') ? '' : (stryCov_9fa48('2007'), 'Failed to save state'),
            stryMutAct_9fa48('2008')
              ? {}
              : (stryCov_9fa48('2008'),
                {
                  interviewId,
                  error: err instanceof Error ? err.message : String(err),
                })
          );
          throw new StatePersistenceError(
            stryMutAct_9fa48('2009') ? '' : (stryCov_9fa48('2009'), 'Failed to save state'),
            stryMutAct_9fa48('2010') ? '' : (stryCov_9fa48('2010'), 'TRANSACTION_ERROR'),
            stryMutAct_9fa48('2011') ? true : (stryCov_9fa48('2011'), false)
          );
        }
      }
    }
  }

  /**
   * Load interview state from database
   */
  async loadState(options: LoadStateOptions): Promise<InterviewState | null> {
    if (stryMutAct_9fa48('2012')) {
      {
      }
    } else {
      stryCov_9fa48('2012');
      const { interviewId, userId } = options;
      try {
        if (stryMutAct_9fa48('2013')) {
          {
          }
        } else {
          stryCov_9fa48('2013');
          const interview = await this.prisma.interview.findUnique(
            stryMutAct_9fa48('2014')
              ? {}
              : (stryCov_9fa48('2014'),
                {
                  where: stryMutAct_9fa48('2015')
                    ? {}
                    : (stryCov_9fa48('2015'),
                      {
                        id: interviewId,
                      }),
                  include: stryMutAct_9fa48('2016')
                    ? {}
                    : (stryCov_9fa48('2016'),
                      {
                        messages: stryMutAct_9fa48('2017')
                          ? {}
                          : (stryCov_9fa48('2017'),
                            {
                              orderBy: stryMutAct_9fa48('2018')
                                ? {}
                                : (stryCov_9fa48('2018'),
                                  {
                                    createdAt: stryMutAct_9fa48('2019')
                                      ? ''
                                      : (stryCov_9fa48('2019'), 'asc'),
                                  }),
                            }),
                        responses: stryMutAct_9fa48('2020')
                          ? {}
                          : (stryCov_9fa48('2020'),
                            {
                              orderBy: stryMutAct_9fa48('2021')
                                ? {}
                                : (stryCov_9fa48('2021'),
                                  {
                                    createdAt: stryMutAct_9fa48('2022')
                                      ? ''
                                      : (stryCov_9fa48('2022'), 'asc'),
                                  }),
                            }),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('2025')
              ? !interview && interview.userId !== userId
              : stryMutAct_9fa48('2024')
                ? false
                : stryMutAct_9fa48('2023')
                  ? true
                  : (stryCov_9fa48('2023', '2024', '2025'),
                    (stryMutAct_9fa48('2026') ? interview : (stryCov_9fa48('2026'), !interview)) ||
                      (stryMutAct_9fa48('2028')
                        ? interview.userId === userId
                        : stryMutAct_9fa48('2027')
                          ? false
                          : (stryCov_9fa48('2027', '2028'), interview.userId !== userId)))
          ) {
            if (stryMutAct_9fa48('2029')) {
              {
              }
            } else {
              stryCov_9fa48('2029');
              return null;
            }
          }
          return stryMutAct_9fa48('2030')
            ? {}
            : (stryCov_9fa48('2030'),
              {
                userId: interview.userId,
                templateId: interview.templateId,
                interviewId: interview.id,
                status: interview.status as InterviewState['status'],
                messages: interview.messages.map(
                  stryMutAct_9fa48('2031')
                    ? () => undefined
                    : (stryCov_9fa48('2031'),
                      (m) =>
                        stryMutAct_9fa48('2032')
                          ? {}
                          : (stryCov_9fa48('2032'),
                            {
                              role: m.role as 'user' | 'assistant' | 'system',
                              content: m.content,
                              timestamp: m.createdAt,
                            }))
                ),
                currentQuestion: interview.currentQuestion,
                followupCount: interview.followupCount,
                maxFollowups: interview.maxFollowups,
                responses: interview.responses.map(
                  stryMutAct_9fa48('2033')
                    ? () => undefined
                    : (stryCov_9fa48('2033'),
                      (r) =>
                        stryMutAct_9fa48('2034')
                          ? {}
                          : (stryCov_9fa48('2034'),
                            {
                              questionId: r.questionId,
                              content: r.content,
                              isFollowup: r.isFollowup,
                            }))
                ),
                reportGenerated: stryMutAct_9fa48('2035')
                  ? !interview.reportPath
                  : (stryCov_9fa48('2035'),
                    !(stryMutAct_9fa48('2036')
                      ? interview.reportPath
                      : (stryCov_9fa48('2036'), !interview.reportPath))),
                version: interview.version,
                originalVersion: interview.version,
                pendingMessages: stryMutAct_9fa48('2037')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('2037'), []),
                pendingResponses: stryMutAct_9fa48('2038')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('2038'), []),
              });
        }
      } catch (err) {
        if (stryMutAct_9fa48('2039')) {
          {
          }
        } else {
          stryCov_9fa48('2039');
          error(
            stryMutAct_9fa48('2040') ? '' : (stryCov_9fa48('2040'), 'Failed to load state'),
            stryMutAct_9fa48('2041')
              ? {}
              : (stryCov_9fa48('2041'),
                {
                  interviewId,
                  error: err instanceof Error ? err.message : String(err),
                })
          );
          return null;
        }
      }
    }
  }

  /**
   * Load full state for multi-turn conversation with version tracking
   * Initializes pendingMessages and pendingResponses arrays
   */
  async loadFullState(interviewId: string, userId: string): Promise<InterviewState | null> {
    if (stryMutAct_9fa48('2042')) {
      {
      }
    } else {
      stryCov_9fa48('2042');
      try {
        if (stryMutAct_9fa48('2043')) {
          {
          }
        } else {
          stryCov_9fa48('2043');
          const interview = await this.prisma.interview.findUnique(
            stryMutAct_9fa48('2044')
              ? {}
              : (stryCov_9fa48('2044'),
                {
                  where: stryMutAct_9fa48('2045')
                    ? {}
                    : (stryCov_9fa48('2045'),
                      {
                        id: interviewId,
                      }),
                  include: stryMutAct_9fa48('2046')
                    ? {}
                    : (stryCov_9fa48('2046'),
                      {
                        messages: stryMutAct_9fa48('2047')
                          ? {}
                          : (stryCov_9fa48('2047'),
                            {
                              orderBy: stryMutAct_9fa48('2048')
                                ? {}
                                : (stryCov_9fa48('2048'),
                                  {
                                    createdAt: stryMutAct_9fa48('2049')
                                      ? ''
                                      : (stryCov_9fa48('2049'), 'asc'),
                                  }),
                            }),
                        responses: stryMutAct_9fa48('2050')
                          ? {}
                          : (stryCov_9fa48('2050'),
                            {
                              orderBy: stryMutAct_9fa48('2051')
                                ? {}
                                : (stryCov_9fa48('2051'),
                                  {
                                    createdAt: stryMutAct_9fa48('2052')
                                      ? ''
                                      : (stryCov_9fa48('2052'), 'asc'),
                                  }),
                            }),
                      }),
                })
          );
          if (
            stryMutAct_9fa48('2055')
              ? !interview && interview.userId !== userId
              : stryMutAct_9fa48('2054')
                ? false
                : stryMutAct_9fa48('2053')
                  ? true
                  : (stryCov_9fa48('2053', '2054', '2055'),
                    (stryMutAct_9fa48('2056') ? interview : (stryCov_9fa48('2056'), !interview)) ||
                      (stryMutAct_9fa48('2058')
                        ? interview.userId === userId
                        : stryMutAct_9fa48('2057')
                          ? false
                          : (stryCov_9fa48('2057', '2058'), interview.userId !== userId)))
          ) {
            if (stryMutAct_9fa48('2059')) {
              {
              }
            } else {
              stryCov_9fa48('2059');
              return null;
            }
          }
          return stryMutAct_9fa48('2060')
            ? {}
            : (stryCov_9fa48('2060'),
              {
                userId: interview.userId,
                templateId: interview.templateId,
                interviewId: interview.id,
                status: interview.status as InterviewState['status'],
                messages: interview.messages.map(
                  stryMutAct_9fa48('2061')
                    ? () => undefined
                    : (stryCov_9fa48('2061'),
                      (m) =>
                        stryMutAct_9fa48('2062')
                          ? {}
                          : (stryCov_9fa48('2062'),
                            {
                              role: m.role as 'user' | 'assistant' | 'system',
                              content: m.content,
                              timestamp: m.createdAt,
                            }))
                ),
                currentQuestion: interview.currentQuestion,
                followupCount: interview.followupCount,
                maxFollowups: interview.maxFollowups,
                responses: interview.responses.map(
                  stryMutAct_9fa48('2063')
                    ? () => undefined
                    : (stryCov_9fa48('2063'),
                      (r) =>
                        stryMutAct_9fa48('2064')
                          ? {}
                          : (stryCov_9fa48('2064'),
                            {
                              questionId: r.questionId,
                              content: r.content,
                              isFollowup: r.isFollowup,
                            }))
                ),
                reportGenerated: stryMutAct_9fa48('2065')
                  ? !interview.reportPath
                  : (stryCov_9fa48('2065'),
                    !(stryMutAct_9fa48('2066')
                      ? interview.reportPath
                      : (stryCov_9fa48('2066'), !interview.reportPath))),
                version: interview.version,
                originalVersion: interview.version,
                pendingMessages: stryMutAct_9fa48('2067')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('2067'), []),
                pendingResponses: stryMutAct_9fa48('2068')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('2068'), []),
              });
        }
      } catch (err) {
        if (stryMutAct_9fa48('2069')) {
          {
          }
        } else {
          stryCov_9fa48('2069');
          error(
            stryMutAct_9fa48('2070') ? '' : (stryCov_9fa48('2070'), 'Failed to load full state'),
            stryMutAct_9fa48('2071')
              ? {}
              : (stryCov_9fa48('2071'),
                {
                  interviewId,
                  error: err instanceof Error ? err.message : String(err),
                })
          );
          return null;
        }
      }
    }
  }

  /**
   * Save full state with pending messages/responses in atomic transaction
   * Uses originalVersion for optimistic locking check
   * Returns new version after save
   */
  async saveFullState(
    interviewId: string,
    state: InterviewState
  ): Promise<{
    success: boolean;
    newVersion: number;
  }> {
    if (stryMutAct_9fa48('2072')) {
      {
      }
    } else {
      stryCov_9fa48('2072');
      try {
        if (stryMutAct_9fa48('2073')) {
          {
          }
        } else {
          stryCov_9fa48('2073');
          const updatedInterview = await this.prisma.$transaction(async (tx) => {
            if (stryMutAct_9fa48('2074')) {
              {
              }
            } else {
              stryCov_9fa48('2074');
              const interview = await tx.interview.findUnique(
                stryMutAct_9fa48('2075')
                  ? {}
                  : (stryCov_9fa48('2075'),
                    {
                      where: stryMutAct_9fa48('2076')
                        ? {}
                        : (stryCov_9fa48('2076'),
                          {
                            id: interviewId,
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('2079')
                  ? false
                  : stryMutAct_9fa48('2078')
                    ? true
                    : stryMutAct_9fa48('2077')
                      ? interview
                      : (stryCov_9fa48('2077', '2078', '2079'), !interview)
              ) {
                if (stryMutAct_9fa48('2080')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2080');
                  throw new StatePersistenceError(
                    stryMutAct_9fa48('2081')
                      ? ``
                      : (stryCov_9fa48('2081'), `Interview not found: ${interviewId}`),
                    stryMutAct_9fa48('2082') ? '' : (stryCov_9fa48('2082'), 'NOT_FOUND'),
                    stryMutAct_9fa48('2083') ? true : (stryCov_9fa48('2083'), false)
                  );
                }
              }
              if (
                stryMutAct_9fa48('2086')
                  ? interview.version === state.originalVersion
                  : stryMutAct_9fa48('2085')
                    ? false
                    : stryMutAct_9fa48('2084')
                      ? true
                      : (stryCov_9fa48('2084', '2085', '2086'),
                        interview.version !== state.originalVersion)
              ) {
                if (stryMutAct_9fa48('2087')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2087');
                  throw new StatePersistenceError(
                    stryMutAct_9fa48('2088')
                      ? ``
                      : (stryCov_9fa48('2088'),
                        `Version conflict: expected ${state.originalVersion}, got ${interview.version}`),
                    stryMutAct_9fa48('2089') ? '' : (stryCov_9fa48('2089'), 'VERSION_CONFLICT'),
                    stryMutAct_9fa48('2090') ? false : (stryCov_9fa48('2090'), true)
                  );
                }
              }
              if (
                stryMutAct_9fa48('2094')
                  ? state.pendingMessages.length <= 0
                  : stryMutAct_9fa48('2093')
                    ? state.pendingMessages.length >= 0
                    : stryMutAct_9fa48('2092')
                      ? false
                      : stryMutAct_9fa48('2091')
                        ? true
                        : (stryCov_9fa48('2091', '2092', '2093', '2094'),
                          state.pendingMessages.length > 0)
              ) {
                if (stryMutAct_9fa48('2095')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2095');
                  await tx.message.createMany(
                    stryMutAct_9fa48('2096')
                      ? {}
                      : (stryCov_9fa48('2096'),
                        {
                          data: state.pendingMessages.map(
                            stryMutAct_9fa48('2097')
                              ? () => undefined
                              : (stryCov_9fa48('2097'),
                                (m) =>
                                  stryMutAct_9fa48('2098')
                                    ? {}
                                    : (stryCov_9fa48('2098'),
                                      {
                                        interviewId,
                                        role: m.role,
                                        content: m.content,
                                        isVoice: m.isVoice,
                                      }))
                          ),
                        })
                  );
                }
              }
              if (
                stryMutAct_9fa48('2102')
                  ? state.pendingResponses.length <= 0
                  : stryMutAct_9fa48('2101')
                    ? state.pendingResponses.length >= 0
                    : stryMutAct_9fa48('2100')
                      ? false
                      : stryMutAct_9fa48('2099')
                        ? true
                        : (stryCov_9fa48('2099', '2100', '2101', '2102'),
                          state.pendingResponses.length > 0)
              ) {
                if (stryMutAct_9fa48('2103')) {
                  {
                  }
                } else {
                  stryCov_9fa48('2103');
                  await tx.response.createMany(
                    stryMutAct_9fa48('2104')
                      ? {}
                      : (stryCov_9fa48('2104'),
                        {
                          data: state.pendingResponses.map(
                            stryMutAct_9fa48('2105')
                              ? () => undefined
                              : (stryCov_9fa48('2105'),
                                (r) =>
                                  stryMutAct_9fa48('2106')
                                    ? {}
                                    : (stryCov_9fa48('2106'),
                                      {
                                        interviewId,
                                        questionId: r.questionId,
                                        content: r.content,
                                        isFollowup: r.isFollowup,
                                      }))
                          ),
                        })
                  );
                }
              }
              const updated = await tx.interview.update(
                stryMutAct_9fa48('2107')
                  ? {}
                  : (stryCov_9fa48('2107'),
                    {
                      where: stryMutAct_9fa48('2108')
                        ? {}
                        : (stryCov_9fa48('2108'),
                          {
                            id: interviewId,
                            version: state.originalVersion,
                          }),
                      data: stryMutAct_9fa48('2109')
                        ? {}
                        : (stryCov_9fa48('2109'),
                          {
                            status: state.status as InterviewStatus,
                            currentQuestion: state.currentQuestion,
                            followupCount: state.followupCount,
                            version: stryMutAct_9fa48('2110')
                              ? {}
                              : (stryCov_9fa48('2110'),
                                {
                                  increment: 1,
                                }),
                          }),
                    })
              );
              return updated;
            }
          });
          state.version = updatedInterview.version;
          state.originalVersion = updatedInterview.version;
          state.pendingMessages = stryMutAct_9fa48('2111')
            ? ['Stryker was here']
            : (stryCov_9fa48('2111'), []);
          state.pendingResponses = stryMutAct_9fa48('2112')
            ? ['Stryker was here']
            : (stryCov_9fa48('2112'), []);
          info(
            stryMutAct_9fa48('2113')
              ? ''
              : (stryCov_9fa48('2113'), 'Full state saved successfully'),
            stryMutAct_9fa48('2114')
              ? {}
              : (stryCov_9fa48('2114'),
                {
                  interviewId,
                  version: updatedInterview.version,
                })
          );
          return stryMutAct_9fa48('2115')
            ? {}
            : (stryCov_9fa48('2115'),
              {
                success: stryMutAct_9fa48('2116') ? false : (stryCov_9fa48('2116'), true),
                newVersion: updatedInterview.version,
              });
        }
      } catch (err) {
        if (stryMutAct_9fa48('2117')) {
          {
          }
        } else {
          stryCov_9fa48('2117');
          if (
            stryMutAct_9fa48('2119')
              ? false
              : stryMutAct_9fa48('2118')
                ? true
                : (stryCov_9fa48('2118', '2119'), err instanceof StatePersistenceError)
          ) {
            if (stryMutAct_9fa48('2120')) {
              {
              }
            } else {
              stryCov_9fa48('2120');
              error(
                stryMutAct_9fa48('2121') ? '' : (stryCov_9fa48('2121'), 'State persistence error'),
                stryMutAct_9fa48('2122')
                  ? {}
                  : (stryCov_9fa48('2122'),
                    {
                      interviewId,
                      code: err.code,
                      message: err.message,
                    })
              );
              throw err;
            }
          }
          error(
            stryMutAct_9fa48('2123') ? '' : (stryCov_9fa48('2123'), 'Failed to save full state'),
            stryMutAct_9fa48('2124')
              ? {}
              : (stryCov_9fa48('2124'),
                {
                  interviewId,
                  error: err instanceof Error ? err.message : String(err),
                })
          );
          throw new StatePersistenceError(
            stryMutAct_9fa48('2125') ? '' : (stryCov_9fa48('2125'), 'Failed to save full state'),
            stryMutAct_9fa48('2126') ? '' : (stryCov_9fa48('2126'), 'TRANSACTION_ERROR'),
            stryMutAct_9fa48('2127') ? true : (stryCov_9fa48('2127'), false)
          );
        }
      }
    }
  }

  /**
   * Create new interview with initial state
   */
  async createInterview(userId: string, templateId: string): Promise<string> {
    if (stryMutAct_9fa48('2128')) {
      {
      }
    } else {
      stryCov_9fa48('2128');
      const interview = await this.prisma.interview.create(
        stryMutAct_9fa48('2129')
          ? {}
          : (stryCov_9fa48('2129'),
            {
              data: stryMutAct_9fa48('2130')
                ? {}
                : (stryCov_9fa48('2130'),
                  {
                    userId,
                    templateId,
                    status: stryMutAct_9fa48('2131') ? '' : (stryCov_9fa48('2131'), 'PENDING'),
                    version: 1,
                  }),
            })
      );
      return interview.id;
    }
  }

  /**
   * Get interview version for optimistic locking
   */
  async getVersion(interviewId: string): Promise<number> {
    if (stryMutAct_9fa48('2132')) {
      {
      }
    } else {
      stryCov_9fa48('2132');
      const interview = await this.prisma.interview.findUnique(
        stryMutAct_9fa48('2133')
          ? {}
          : (stryCov_9fa48('2133'),
            {
              where: stryMutAct_9fa48('2134')
                ? {}
                : (stryCov_9fa48('2134'),
                  {
                    id: interviewId,
                  }),
              select: stryMutAct_9fa48('2135')
                ? {}
                : (stryCov_9fa48('2135'),
                  {
                    version: stryMutAct_9fa48('2136') ? false : (stryCov_9fa48('2136'), true),
                  }),
            })
      );
      return stryMutAct_9fa48('2139')
        ? interview?.version && 0
        : stryMutAct_9fa48('2138')
          ? false
          : stryMutAct_9fa48('2137')
            ? true
            : (stryCov_9fa48('2137', '2138', '2139'),
              (stryMutAct_9fa48('2140')
                ? interview.version
                : (stryCov_9fa48('2140'), interview?.version)) || 0);
    }
  }

  /**
   * Find active interview for a user (for multi-turn conversation)
   * Returns the most recent ACTIVE/WAITING interview
   */
  async findActiveInterview(userId: string): Promise<InterviewState | null> {
    if (stryMutAct_9fa48('2141')) {
      {
      }
    } else {
      stryCov_9fa48('2141');
      const interview = await this.prisma.interview.findFirst(
        stryMutAct_9fa48('2142')
          ? {}
          : (stryCov_9fa48('2142'),
            {
              where: stryMutAct_9fa48('2143')
                ? {}
                : (stryCov_9fa48('2143'),
                  {
                    userId,
                    status: stryMutAct_9fa48('2144')
                      ? {}
                      : (stryCov_9fa48('2144'),
                        {
                          in: stryMutAct_9fa48('2145')
                            ? []
                            : (stryCov_9fa48('2145'),
                              [
                                stryMutAct_9fa48('2146') ? '' : (stryCov_9fa48('2146'), 'ACTIVE'),
                                stryMutAct_9fa48('2147') ? '' : (stryCov_9fa48('2147'), 'WAITING'),
                              ]),
                        }),
                  }),
              orderBy: stryMutAct_9fa48('2148')
                ? {}
                : (stryCov_9fa48('2148'),
                  {
                    createdAt: stryMutAct_9fa48('2149') ? '' : (stryCov_9fa48('2149'), 'desc'),
                  }),
              include: stryMutAct_9fa48('2150')
                ? {}
                : (stryCov_9fa48('2150'),
                  {
                    messages: stryMutAct_9fa48('2151')
                      ? {}
                      : (stryCov_9fa48('2151'),
                        {
                          orderBy: stryMutAct_9fa48('2152')
                            ? {}
                            : (stryCov_9fa48('2152'),
                              {
                                createdAt: stryMutAct_9fa48('2153')
                                  ? ''
                                  : (stryCov_9fa48('2153'), 'asc'),
                              }),
                        }),
                    responses: stryMutAct_9fa48('2154')
                      ? {}
                      : (stryCov_9fa48('2154'),
                        {
                          orderBy: stryMutAct_9fa48('2155')
                            ? {}
                            : (stryCov_9fa48('2155'),
                              {
                                createdAt: stryMutAct_9fa48('2156')
                                  ? ''
                                  : (stryCov_9fa48('2156'), 'asc'),
                              }),
                        }),
                  }),
            })
      );
      if (
        stryMutAct_9fa48('2159')
          ? false
          : stryMutAct_9fa48('2158')
            ? true
            : stryMutAct_9fa48('2157')
              ? interview
              : (stryCov_9fa48('2157', '2158', '2159'), !interview)
      ) {
        if (stryMutAct_9fa48('2160')) {
          {
          }
        } else {
          stryCov_9fa48('2160');
          return null;
        }
      }
      return stryMutAct_9fa48('2161')
        ? {}
        : (stryCov_9fa48('2161'),
          {
            userId: interview.userId,
            templateId: interview.templateId,
            interviewId: interview.id,
            status: interview.status as InterviewState['status'],
            messages: interview.messages.map(
              stryMutAct_9fa48('2162')
                ? () => undefined
                : (stryCov_9fa48('2162'),
                  (m) =>
                    stryMutAct_9fa48('2163')
                      ? {}
                      : (stryCov_9fa48('2163'),
                        {
                          role: m.role as 'user' | 'assistant' | 'system',
                          content: m.content,
                          timestamp: m.createdAt,
                        }))
            ),
            currentQuestion: interview.currentQuestion,
            followupCount: interview.followupCount,
            maxFollowups: interview.maxFollowups,
            responses: interview.responses.map(
              stryMutAct_9fa48('2164')
                ? () => undefined
                : (stryCov_9fa48('2164'),
                  (r) =>
                    stryMutAct_9fa48('2165')
                      ? {}
                      : (stryCov_9fa48('2165'),
                        {
                          questionId: r.questionId,
                          content: r.content,
                          isFollowup: r.isFollowup,
                        }))
            ),
            reportGenerated: stryMutAct_9fa48('2166')
              ? !interview.reportPath
              : (stryCov_9fa48('2166'),
                !(stryMutAct_9fa48('2167')
                  ? interview.reportPath
                  : (stryCov_9fa48('2167'), !interview.reportPath))),
            version: interview.version,
            originalVersion: interview.version,
            pendingMessages: stryMutAct_9fa48('2168')
              ? ['Stryker was here']
              : (stryCov_9fa48('2168'), []),
            pendingResponses: stryMutAct_9fa48('2169')
              ? ['Stryker was here']
              : (stryCov_9fa48('2169'), []),
          });
    }
  }
  async disconnect(): Promise<void> {
    if (stryMutAct_9fa48('2170')) {
      {
      }
    } else {
      stryCov_9fa48('2170');
      await this.prisma.$disconnect();
    }
  }
}
