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
import { PrismaClient, Template, TemplateStatus } from '@prisma/client';
export class TemplateRepository {
  private readonly prisma: PrismaClient;
  constructor(prisma?: PrismaClient) {
    if (stryMutAct_9fa48('2193')) {
      {
      }
    } else {
      stryCov_9fa48('2193');
      this.prisma = stryMutAct_9fa48('2196')
        ? prisma && new PrismaClient()
        : stryMutAct_9fa48('2195')
          ? false
          : stryMutAct_9fa48('2194')
            ? true
            : (stryCov_9fa48('2194', '2195', '2196'), prisma || new PrismaClient());
    }
  }
  async create(data: {
    name: string;
    content: Record<string, unknown>;
    description?: string;
  }): Promise<Template> {
    if (stryMutAct_9fa48('2197')) {
      {
      }
    } else {
      stryCov_9fa48('2197');
      return this.prisma.template.create(
        stryMutAct_9fa48('2198')
          ? {}
          : (stryCov_9fa48('2198'),
            {
              data: stryMutAct_9fa48('2199')
                ? {}
                : (stryCov_9fa48('2199'),
                  {
                    name: data.name,
                    description: data.description,
                    content: JSON.stringify(data.content),
                    version: 1,
                    status: TemplateStatus.DRAFT,
                  }),
            })
      );
    }
  }
  async findAll(): Promise<Template[]> {
    if (stryMutAct_9fa48('2200')) {
      {
      }
    } else {
      stryCov_9fa48('2200');
      return this.prisma.template.findMany(
        stryMutAct_9fa48('2201')
          ? {}
          : (stryCov_9fa48('2201'),
            {
              orderBy: stryMutAct_9fa48('2202')
                ? {}
                : (stryCov_9fa48('2202'),
                  {
                    createdAt: stryMutAct_9fa48('2203') ? '' : (stryCov_9fa48('2203'), 'desc'),
                  }),
            })
      );
    }
  }
  async findById(id: string): Promise<Template | null> {
    if (stryMutAct_9fa48('2204')) {
      {
      }
    } else {
      stryCov_9fa48('2204');
      return this.prisma.template.findUnique(
        stryMutAct_9fa48('2205')
          ? {}
          : (stryCov_9fa48('2205'),
            {
              where: stryMutAct_9fa48('2206')
                ? {}
                : (stryCov_9fa48('2206'),
                  {
                    id,
                  }),
            })
      );
    }
  }
  async update(
    id: string,
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status: TemplateStatus;
    }>
  ): Promise<Template> {
    if (stryMutAct_9fa48('2207')) {
      {
      }
    } else {
      stryCov_9fa48('2207');
      const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
      if (
        stryMutAct_9fa48('2209')
          ? false
          : stryMutAct_9fa48('2208')
            ? true
            : (stryCov_9fa48('2208', '2209'), data.name)
      )
        updateData.name = data.name;
      if (
        stryMutAct_9fa48('2211')
          ? false
          : stryMutAct_9fa48('2210')
            ? true
            : (stryCov_9fa48('2210', '2211'), data.description)
      )
        updateData.description = data.description;
      if (
        stryMutAct_9fa48('2213')
          ? false
          : stryMutAct_9fa48('2212')
            ? true
            : (stryCov_9fa48('2212', '2213'), data.content)
      )
        updateData.content = JSON.stringify(data.content);
      if (
        stryMutAct_9fa48('2215')
          ? false
          : stryMutAct_9fa48('2214')
            ? true
            : (stryCov_9fa48('2214', '2215'), data.status)
      )
        updateData.status = data.status;
      return this.prisma.template.update(
        stryMutAct_9fa48('2216')
          ? {}
          : (stryCov_9fa48('2216'),
            {
              where: stryMutAct_9fa48('2217')
                ? {}
                : (stryCov_9fa48('2217'),
                  {
                    id,
                  }),
              data: updateData,
            })
      );
    }
  }
  async delete(id: string): Promise<boolean> {
    if (stryMutAct_9fa48('2218')) {
      {
      }
    } else {
      stryCov_9fa48('2218');
      await this.prisma.template.delete(
        stryMutAct_9fa48('2219')
          ? {}
          : (stryCov_9fa48('2219'),
            {
              where: stryMutAct_9fa48('2220')
                ? {}
                : (stryCov_9fa48('2220'),
                  {
                    id,
                  }),
            })
      );
      return stryMutAct_9fa48('2221') ? false : (stryCov_9fa48('2221'), true);
    }
  }
  async findByStatus(status: TemplateStatus): Promise<Template[]> {
    if (stryMutAct_9fa48('2222')) {
      {
      }
    } else {
      stryCov_9fa48('2222');
      return this.prisma.template.findMany(
        stryMutAct_9fa48('2223')
          ? {}
          : (stryCov_9fa48('2223'),
            {
              where: stryMutAct_9fa48('2224')
                ? {}
                : (stryCov_9fa48('2224'),
                  {
                    status,
                  }),
              orderBy: stryMutAct_9fa48('2225')
                ? {}
                : (stryCov_9fa48('2225'),
                  {
                    createdAt: stryMutAct_9fa48('2226') ? '' : (stryCov_9fa48('2226'), 'desc'),
                  }),
            })
      );
    }
  }
  async incrementVersion(id: string): Promise<Template> {
    if (stryMutAct_9fa48('2227')) {
      {
      }
    } else {
      stryCov_9fa48('2227');
      const template = await this.findById(id);
      if (
        stryMutAct_9fa48('2230')
          ? false
          : stryMutAct_9fa48('2229')
            ? true
            : stryMutAct_9fa48('2228')
              ? template
              : (stryCov_9fa48('2228', '2229', '2230'), !template)
      )
        throw new Error(
          stryMutAct_9fa48('2231') ? '' : (stryCov_9fa48('2231'), 'Template not found')
        );
      return this.prisma.template.update(
        stryMutAct_9fa48('2232')
          ? {}
          : (stryCov_9fa48('2232'),
            {
              where: stryMutAct_9fa48('2233')
                ? {}
                : (stryCov_9fa48('2233'),
                  {
                    id,
                  }),
              data: stryMutAct_9fa48('2234')
                ? {}
                : (stryCov_9fa48('2234'),
                  {
                    version: stryMutAct_9fa48('2235')
                      ? {}
                      : (stryCov_9fa48('2235'),
                        {
                          increment: 1,
                        }),
                  }),
            })
      );
    }
  }
  async getVersion(id: string): Promise<{
    id: string;
    version: number;
  } | null> {
    if (stryMutAct_9fa48('2236')) {
      {
      }
    } else {
      stryCov_9fa48('2236');
      const template = await this.findById(id);
      if (
        stryMutAct_9fa48('2239')
          ? false
          : stryMutAct_9fa48('2238')
            ? true
            : stryMutAct_9fa48('2237')
              ? template
              : (stryCov_9fa48('2237', '2238', '2239'), !template)
      )
        return null;
      return stryMutAct_9fa48('2240')
        ? {}
        : (stryCov_9fa48('2240'),
          {
            id: template.id,
            version: template.version,
          });
    }
  }
  async getVersionHistory(id: string): Promise<
    Array<{
      id: string;
      version: number;
      createdAt: Date;
    }>
  > {
    if (stryMutAct_9fa48('2241')) {
      {
      }
    } else {
      stryCov_9fa48('2241');
      const template = await this.findById(id);
      if (
        stryMutAct_9fa48('2244')
          ? false
          : stryMutAct_9fa48('2243')
            ? true
            : stryMutAct_9fa48('2242')
              ? template
              : (stryCov_9fa48('2242', '2243', '2244'), !template)
      )
        throw new Error(
          stryMutAct_9fa48('2245') ? '' : (stryCov_9fa48('2245'), 'Template not found')
        );
      return stryMutAct_9fa48('2246')
        ? []
        : (stryCov_9fa48('2246'),
          [
            stryMutAct_9fa48('2247')
              ? {}
              : (stryCov_9fa48('2247'),
                {
                  id: template.id,
                  version: template.version,
                  createdAt: template.createdAt,
                }),
          ]);
    }
  }
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status?: string;
    }>
  ): Promise<Template> {
    if (stryMutAct_9fa48('2248')) {
      {
      }
    } else {
      stryCov_9fa48('2248');
      const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
      if (
        stryMutAct_9fa48('2250')
          ? false
          : stryMutAct_9fa48('2249')
            ? true
            : (stryCov_9fa48('2249', '2250'), data.name)
      )
        updateData.name = data.name;
      if (
        stryMutAct_9fa48('2252')
          ? false
          : stryMutAct_9fa48('2251')
            ? true
            : (stryCov_9fa48('2251', '2252'), data.description)
      )
        updateData.description = data.description;
      if (
        stryMutAct_9fa48('2254')
          ? false
          : stryMutAct_9fa48('2253')
            ? true
            : (stryCov_9fa48('2253', '2254'), data.content)
      )
        updateData.content = JSON.stringify(data.content);
      if (
        stryMutAct_9fa48('2256')
          ? false
          : stryMutAct_9fa48('2255')
            ? true
            : (stryCov_9fa48('2255', '2256'), data.status)
      )
        updateData.status = data.status as TemplateStatus;
      updateData.version = stryMutAct_9fa48('2257')
        ? {}
        : (stryCov_9fa48('2257'),
          {
            increment: 1,
          });
      return this.prisma.template.update(
        stryMutAct_9fa48('2258')
          ? {}
          : (stryCov_9fa48('2258'),
            {
              where: stryMutAct_9fa48('2259')
                ? {}
                : (stryCov_9fa48('2259'),
                  {
                    id,
                    version: expectedVersion,
                  }),
              data: updateData,
            })
      );
    }
  }
  async findAllPaginated(
    page: number,
    limit: number
  ): Promise<{
    items: Template[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (stryMutAct_9fa48('2260')) {
      {
      }
    } else {
      stryCov_9fa48('2260');
      const [items, total] = await Promise.all(
        stryMutAct_9fa48('2261')
          ? []
          : (stryCov_9fa48('2261'),
            [
              this.prisma.template.findMany(
                stryMutAct_9fa48('2262')
                  ? {}
                  : (stryCov_9fa48('2262'),
                    {
                      orderBy: stryMutAct_9fa48('2263')
                        ? {}
                        : (stryCov_9fa48('2263'),
                          {
                            updatedAt: stryMutAct_9fa48('2264')
                              ? ''
                              : (stryCov_9fa48('2264'), 'desc'),
                          }),
                      skip: stryMutAct_9fa48('2265')
                        ? (page - 1) / limit
                        : (stryCov_9fa48('2265'),
                          (stryMutAct_9fa48('2266')
                            ? page + 1
                            : (stryCov_9fa48('2266'), page - 1)) * limit),
                      take: limit,
                    })
              ),
              this.prisma.template.count(),
            ])
      );
      return stryMutAct_9fa48('2267')
        ? {}
        : (stryCov_9fa48('2267'),
          {
            items,
            total,
            page,
            limit,
          });
    }
  }
  async getUsageStats(templateId: string): Promise<{
    templateId: string;
    templateName: string;
    interviews: {
      active: number;
      pending: number;
      waiting: number;
      completed: number;
      cancelled: number;
      total: number;
    };
    plans: {
      running: number;
      pending: number;
      ready: number;
      paused: number;
      completed: number;
      total: number;
    };
    reportCount: number;
    safeToDelete: boolean;
  }> {
    if (stryMutAct_9fa48('2268')) {
      {
      }
    } else {
      stryCov_9fa48('2268');
      const [template, interviewGroups, planGroups, reportCount] = await Promise.all(
        stryMutAct_9fa48('2269')
          ? []
          : (stryCov_9fa48('2269'),
            [
              this.prisma.template.findUnique(
                stryMutAct_9fa48('2270')
                  ? {}
                  : (stryCov_9fa48('2270'),
                    {
                      where: stryMutAct_9fa48('2271')
                        ? {}
                        : (stryCov_9fa48('2271'),
                          {
                            id: templateId,
                          }),
                      select: stryMutAct_9fa48('2272')
                        ? {}
                        : (stryCov_9fa48('2272'),
                          {
                            name: stryMutAct_9fa48('2273') ? false : (stryCov_9fa48('2273'), true),
                          }),
                    })
              ),
              this.prisma.interview.groupBy(
                stryMutAct_9fa48('2274')
                  ? {}
                  : (stryCov_9fa48('2274'),
                    {
                      by: stryMutAct_9fa48('2275')
                        ? []
                        : (stryCov_9fa48('2275'),
                          [stryMutAct_9fa48('2276') ? '' : (stryCov_9fa48('2276'), 'status')]),
                      where: stryMutAct_9fa48('2277')
                        ? {}
                        : (stryCov_9fa48('2277'),
                          {
                            templateId,
                          }),
                      _count: stryMutAct_9fa48('2278') ? false : (stryCov_9fa48('2278'), true),
                    })
              ),
              this.prisma.interviewPlan.groupBy(
                stryMutAct_9fa48('2279')
                  ? {}
                  : (stryCov_9fa48('2279'),
                    {
                      by: stryMutAct_9fa48('2280')
                        ? []
                        : (stryCov_9fa48('2280'),
                          [stryMutAct_9fa48('2281') ? '' : (stryCov_9fa48('2281'), 'status')]),
                      where: stryMutAct_9fa48('2282')
                        ? {}
                        : (stryCov_9fa48('2282'),
                          {
                            templateId,
                          }),
                      _count: stryMutAct_9fa48('2283') ? false : (stryCov_9fa48('2283'), true),
                    })
              ),
              this.prisma.batchAnalysisReport.count(
                stryMutAct_9fa48('2284')
                  ? {}
                  : (stryCov_9fa48('2284'),
                    {
                      where: stryMutAct_9fa48('2285')
                        ? {}
                        : (stryCov_9fa48('2285'),
                          {
                            templateId,
                          }),
                    })
              ),
            ])
      );
      if (
        stryMutAct_9fa48('2288')
          ? false
          : stryMutAct_9fa48('2287')
            ? true
            : stryMutAct_9fa48('2286')
              ? template
              : (stryCov_9fa48('2286', '2287', '2288'), !template)
      ) {
        if (stryMutAct_9fa48('2289')) {
          {
          }
        } else {
          stryCov_9fa48('2289');
          throw new Error(
            stryMutAct_9fa48('2290') ? '' : (stryCov_9fa48('2290'), 'Template not found')
          );
        }
      }
      const interviews = stryMutAct_9fa48('2291')
        ? {}
        : (stryCov_9fa48('2291'),
          {
            active: 0,
            pending: 0,
            waiting: 0,
            completed: 0,
            cancelled: 0,
            total: 0,
          });
      for (const group of interviewGroups) {
        if (stryMutAct_9fa48('2292')) {
          {
          }
        } else {
          stryCov_9fa48('2292');
          const count = group._count;
          switch (group.status) {
            case stryMutAct_9fa48('2294') ? '' : (stryCov_9fa48('2294'), 'ACTIVE'):
              if (stryMutAct_9fa48('2293')) {
              } else {
                stryCov_9fa48('2293');
                interviews.active = count;
                break;
              }
            case stryMutAct_9fa48('2296') ? '' : (stryCov_9fa48('2296'), 'PENDING'):
              if (stryMutAct_9fa48('2295')) {
              } else {
                stryCov_9fa48('2295');
                interviews.pending = count;
                break;
              }
            case stryMutAct_9fa48('2298') ? '' : (stryCov_9fa48('2298'), 'WAITING'):
              if (stryMutAct_9fa48('2297')) {
              } else {
                stryCov_9fa48('2297');
                interviews.waiting = count;
                break;
              }
            case stryMutAct_9fa48('2300') ? '' : (stryCov_9fa48('2300'), 'COMPLETED'):
              if (stryMutAct_9fa48('2299')) {
              } else {
                stryCov_9fa48('2299');
                interviews.completed = count;
                break;
              }
            case stryMutAct_9fa48('2302') ? '' : (stryCov_9fa48('2302'), 'CANCELLED'):
              if (stryMutAct_9fa48('2301')) {
              } else {
                stryCov_9fa48('2301');
                interviews.cancelled = count;
                break;
              }
          }
        }
      }
      interviews.total = stryMutAct_9fa48('2303')
        ? interviews.active +
          interviews.pending +
          interviews.waiting +
          interviews.completed -
          interviews.cancelled
        : (stryCov_9fa48('2303'),
          (stryMutAct_9fa48('2304')
            ? interviews.active + interviews.pending + interviews.waiting - interviews.completed
            : (stryCov_9fa48('2304'),
              (stryMutAct_9fa48('2305')
                ? interviews.active + interviews.pending - interviews.waiting
                : (stryCov_9fa48('2305'),
                  (stryMutAct_9fa48('2306')
                    ? interviews.active - interviews.pending
                    : (stryCov_9fa48('2306'), interviews.active + interviews.pending)) +
                    interviews.waiting)) + interviews.completed)) + interviews.cancelled);
      const plans = stryMutAct_9fa48('2307')
        ? {}
        : (stryCov_9fa48('2307'),
          {
            running: 0,
            pending: 0,
            ready: 0,
            paused: 0,
            completed: 0,
            total: 0,
          });
      for (const group of planGroups) {
        if (stryMutAct_9fa48('2308')) {
          {
          }
        } else {
          stryCov_9fa48('2308');
          const count = group._count;
          switch (group.status) {
            case stryMutAct_9fa48('2310') ? '' : (stryCov_9fa48('2310'), 'RUNNING'):
              if (stryMutAct_9fa48('2309')) {
              } else {
                stryCov_9fa48('2309');
                plans.running = count;
                break;
              }
            case stryMutAct_9fa48('2312') ? '' : (stryCov_9fa48('2312'), 'PENDING'):
              if (stryMutAct_9fa48('2311')) {
              } else {
                stryCov_9fa48('2311');
                plans.pending = count;
                break;
              }
            case stryMutAct_9fa48('2314') ? '' : (stryCov_9fa48('2314'), 'READY'):
              if (stryMutAct_9fa48('2313')) {
              } else {
                stryCov_9fa48('2313');
                plans.ready = count;
                break;
              }
            case stryMutAct_9fa48('2316') ? '' : (stryCov_9fa48('2316'), 'PAUSED'):
              if (stryMutAct_9fa48('2315')) {
              } else {
                stryCov_9fa48('2315');
                plans.paused = count;
                break;
              }
            case stryMutAct_9fa48('2318') ? '' : (stryCov_9fa48('2318'), 'COMPLETED'):
              if (stryMutAct_9fa48('2317')) {
              } else {
                stryCov_9fa48('2317');
                plans.completed = count;
                break;
              }
          }
        }
      }
      plans.total = stryMutAct_9fa48('2319')
        ? plans.running + plans.pending + plans.ready + plans.paused - plans.completed
        : (stryCov_9fa48('2319'),
          (stryMutAct_9fa48('2320')
            ? plans.running + plans.pending + plans.ready - plans.paused
            : (stryCov_9fa48('2320'),
              (stryMutAct_9fa48('2321')
                ? plans.running + plans.pending - plans.ready
                : (stryCov_9fa48('2321'),
                  (stryMutAct_9fa48('2322')
                    ? plans.running - plans.pending
                    : (stryCov_9fa48('2322'), plans.running + plans.pending)) + plans.ready)) +
                plans.paused)) + plans.completed);
      const safeToDelete = stryMutAct_9fa48('2325')
        ? (interviews.active === 0 &&
            interviews.pending === 0 &&
            interviews.waiting === 0 &&
            plans.running === 0 &&
            plans.pending === 0 &&
            plans.ready === 0) ||
          plans.paused === 0
        : stryMutAct_9fa48('2324')
          ? false
          : stryMutAct_9fa48('2323')
            ? true
            : (stryCov_9fa48('2323', '2324', '2325'),
              (stryMutAct_9fa48('2327')
                ? (interviews.active === 0 &&
                    interviews.pending === 0 &&
                    interviews.waiting === 0 &&
                    plans.running === 0 &&
                    plans.pending === 0) ||
                  plans.ready === 0
                : stryMutAct_9fa48('2326')
                  ? true
                  : (stryCov_9fa48('2326', '2327'),
                    (stryMutAct_9fa48('2329')
                      ? (interviews.active === 0 &&
                          interviews.pending === 0 &&
                          interviews.waiting === 0 &&
                          plans.running === 0) ||
                        plans.pending === 0
                      : stryMutAct_9fa48('2328')
                        ? true
                        : (stryCov_9fa48('2328', '2329'),
                          (stryMutAct_9fa48('2331')
                            ? (interviews.active === 0 &&
                                interviews.pending === 0 &&
                                interviews.waiting === 0) ||
                              plans.running === 0
                            : stryMutAct_9fa48('2330')
                              ? true
                              : (stryCov_9fa48('2330', '2331'),
                                (stryMutAct_9fa48('2333')
                                  ? (interviews.active === 0 && interviews.pending === 0) ||
                                    interviews.waiting === 0
                                  : stryMutAct_9fa48('2332')
                                    ? true
                                    : (stryCov_9fa48('2332', '2333'),
                                      (stryMutAct_9fa48('2335')
                                        ? interviews.active === 0 || interviews.pending === 0
                                        : stryMutAct_9fa48('2334')
                                          ? true
                                          : (stryCov_9fa48('2334', '2335'),
                                            (stryMutAct_9fa48('2337')
                                              ? interviews.active !== 0
                                              : stryMutAct_9fa48('2336')
                                                ? true
                                                : (stryCov_9fa48('2336', '2337'),
                                                  interviews.active === 0)) &&
                                              (stryMutAct_9fa48('2339')
                                                ? interviews.pending !== 0
                                                : stryMutAct_9fa48('2338')
                                                  ? true
                                                  : (stryCov_9fa48('2338', '2339'),
                                                    interviews.pending === 0)))) &&
                                        (stryMutAct_9fa48('2341')
                                          ? interviews.waiting !== 0
                                          : stryMutAct_9fa48('2340')
                                            ? true
                                            : (stryCov_9fa48('2340', '2341'),
                                              interviews.waiting === 0)))) &&
                                  (stryMutAct_9fa48('2343')
                                    ? plans.running !== 0
                                    : stryMutAct_9fa48('2342')
                                      ? true
                                      : (stryCov_9fa48('2342', '2343'), plans.running === 0)))) &&
                            (stryMutAct_9fa48('2345')
                              ? plans.pending !== 0
                              : stryMutAct_9fa48('2344')
                                ? true
                                : (stryCov_9fa48('2344', '2345'), plans.pending === 0)))) &&
                      (stryMutAct_9fa48('2347')
                        ? plans.ready !== 0
                        : stryMutAct_9fa48('2346')
                          ? true
                          : (stryCov_9fa48('2346', '2347'), plans.ready === 0)))) &&
                (stryMutAct_9fa48('2349')
                  ? plans.paused !== 0
                  : stryMutAct_9fa48('2348')
                    ? true
                    : (stryCov_9fa48('2348', '2349'), plans.paused === 0)));
      return stryMutAct_9fa48('2350')
        ? {}
        : (stryCov_9fa48('2350'),
          {
            templateId,
            templateName: template.name,
            interviews,
            plans,
            reportCount,
            safeToDelete,
          });
    }
  }
}
