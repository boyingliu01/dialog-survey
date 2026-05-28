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
import { PlanStatus, Prisma, PrismaClient } from '@prisma/client';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info } from '../utils/logger.js';
export interface CreatePlanInput {
  name: string;
  description?: string;
  templateId: string;
  targetDate?: Date;
  schedule?: string;
}
export interface InviteeData {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
}
export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}
export class InterviewPlanService {
  private prisma: PrismaClient;
  constructor(prisma?: PrismaClient) {
    if (stryMutAct_9fa48('3117')) {
      {
      }
    } else {
      stryCov_9fa48('3117');
      this.prisma = stryMutAct_9fa48('3120')
        ? prisma && new PrismaClient()
        : stryMutAct_9fa48('3119')
          ? false
          : stryMutAct_9fa48('3118')
            ? true
            : (stryCov_9fa48('3118', '3119', '3120'), prisma || new PrismaClient());
    }
  }
  async createPlan(input: CreatePlanInput): Promise<string> {
    if (stryMutAct_9fa48('3121')) {
      {
      }
    } else {
      stryCov_9fa48('3121');
      const plan = await this.prisma.interviewPlan.create(
        stryMutAct_9fa48('3122')
          ? {}
          : (stryCov_9fa48('3122'),
            {
              data: stryMutAct_9fa48('3123')
                ? {}
                : (stryCov_9fa48('3123'),
                  {
                    name: input.name,
                    description: input.description,
                    templateId: input.templateId,
                    targetDate: input.targetDate,
                    schedule: input.schedule,
                    status: PlanStatus.PENDING,
                  }),
            })
      );
      info(
        stryMutAct_9fa48('3124') ? '' : (stryCov_9fa48('3124'), 'Interview plan created'),
        stryMutAct_9fa48('3125')
          ? {}
          : (stryCov_9fa48('3125'),
            {
              planId: plan.id,
              name: input.name,
            })
      );
      return plan.id;
    }
  }
  async getPlan(planId: string) {
    if (stryMutAct_9fa48('3126')) {
      {
      }
    } else {
      stryCov_9fa48('3126');
      return this.prisma.interviewPlan.findUnique(
        stryMutAct_9fa48('3127')
          ? {}
          : (stryCov_9fa48('3127'),
            {
              where: stryMutAct_9fa48('3128')
                ? {}
                : (stryCov_9fa48('3128'),
                  {
                    id: planId,
                  }),
              include: stryMutAct_9fa48('3129')
                ? {}
                : (stryCov_9fa48('3129'),
                  {
                    template: stryMutAct_9fa48('3130') ? false : (stryCov_9fa48('3130'), true),
                    interviews: stryMutAct_9fa48('3131')
                      ? {}
                      : (stryCov_9fa48('3131'),
                        {
                          select: stryMutAct_9fa48('3132')
                            ? {}
                            : (stryCov_9fa48('3132'),
                              {
                                id: stryMutAct_9fa48('3133')
                                  ? false
                                  : (stryCov_9fa48('3133'), true),
                                userId: stryMutAct_9fa48('3134')
                                  ? false
                                  : (stryCov_9fa48('3134'), true),
                                status: stryMutAct_9fa48('3135')
                                  ? false
                                  : (stryCov_9fa48('3135'), true),
                                completedAt: stryMutAct_9fa48('3136')
                                  ? false
                                  : (stryCov_9fa48('3136'), true),
                              }),
                        }),
                  }),
            })
      );
    }
  }
  async listPlans(options?: {
    status?: PlanStatus;
    limit?: number;
    offset?: number;
  }) {
    if (stryMutAct_9fa48('3137')) {
      {
      }
    } else {
      stryCov_9fa48('3137');
      const where = (
        stryMutAct_9fa48('3138')
          ? options.status
          : (stryCov_9fa48('3138'), options?.status)
      )
        ? stryMutAct_9fa48('3139')
          ? {}
          : (stryCov_9fa48('3139'),
            {
              status: options.status,
            })
        : {};
      const [plans, total] = await Promise.all(
        stryMutAct_9fa48('3140')
          ? []
          : (stryCov_9fa48('3140'),
            [
              this.prisma.interviewPlan.findMany(
                stryMutAct_9fa48('3141')
                  ? {}
                  : (stryCov_9fa48('3141'),
                    {
                      where,
                      include: stryMutAct_9fa48('3142')
                        ? {}
                        : (stryCov_9fa48('3142'),
                          {
                            template: stryMutAct_9fa48('3143')
                              ? {}
                              : (stryCov_9fa48('3143'),
                                {
                                  select: stryMutAct_9fa48('3144')
                                    ? {}
                                    : (stryCov_9fa48('3144'),
                                      {
                                        id: stryMutAct_9fa48('3145')
                                          ? false
                                          : (stryCov_9fa48('3145'), true),
                                        name: stryMutAct_9fa48('3146')
                                          ? false
                                          : (stryCov_9fa48('3146'), true),
                                      }),
                                }),
                          }),
                      orderBy: stryMutAct_9fa48('3147')
                        ? {}
                        : (stryCov_9fa48('3147'),
                          {
                            createdAt: stryMutAct_9fa48('3148')
                              ? ''
                              : (stryCov_9fa48('3148'), 'desc'),
                          }),
                      take: stryMutAct_9fa48('3151')
                        ? options?.limit && 20
                        : stryMutAct_9fa48('3150')
                          ? false
                          : stryMutAct_9fa48('3149')
                            ? true
                            : (stryCov_9fa48('3149', '3150', '3151'),
                              (stryMutAct_9fa48('3152')
                                ? options.limit
                                : (stryCov_9fa48('3152'), options?.limit)) || 20),
                      skip: stryMutAct_9fa48('3155')
                        ? options?.offset && 0
                        : stryMutAct_9fa48('3154')
                          ? false
                          : stryMutAct_9fa48('3153')
                            ? true
                            : (stryCov_9fa48('3153', '3154', '3155'),
                              (stryMutAct_9fa48('3156')
                                ? options.offset
                                : (stryCov_9fa48('3156'), options?.offset)) || 0),
                    })
              ),
              this.prisma.interviewPlan.count(
                stryMutAct_9fa48('3157')
                  ? {}
                  : (stryCov_9fa48('3157'),
                    {
                      where,
                    })
              ),
            ])
      );
      return stryMutAct_9fa48('3158')
        ? {}
        : (stryCov_9fa48('3158'),
          {
            plans,
            total,
          });
    }
  }
  async importInvitees(planId: string, invitees: InviteeData[]): Promise<ImportResult> {
    if (stryMutAct_9fa48('3159')) {
      {
      }
    } else {
      stryCov_9fa48('3159');
      const result: ImportResult = stryMutAct_9fa48('3160')
        ? {}
        : (stryCov_9fa48('3160'),
          {
            success: 0,
            failed: 0,
            errors: stryMutAct_9fa48('3161') ? ['Stryker was here'] : (stryCov_9fa48('3161'), []),
          });
      const plan = await this.prisma.interviewPlan.findUnique(
        stryMutAct_9fa48('3162')
          ? {}
          : (stryCov_9fa48('3162'),
            {
              where: stryMutAct_9fa48('3163')
                ? {}
                : (stryCov_9fa48('3163'),
                  {
                    id: planId,
                  }),
            })
      );
      if (
        stryMutAct_9fa48('3166')
          ? false
          : stryMutAct_9fa48('3165')
            ? true
            : stryMutAct_9fa48('3164')
              ? plan
              : (stryCov_9fa48('3164', '3165', '3166'), !plan)
      ) {
        if (stryMutAct_9fa48('3167')) {
          {
          }
        } else {
          stryCov_9fa48('3167');
          throw new Error(
            stryMutAct_9fa48('3168') ? `` : (stryCov_9fa48('3168'), `Plan not found: ${planId}`)
          );
        }
      }
      const existingUserIds = new Set(
        (
          await this.prisma.interview.findMany(
            stryMutAct_9fa48('3169')
              ? {}
              : (stryCov_9fa48('3169'),
                {
                  where: stryMutAct_9fa48('3170')
                    ? {}
                    : (stryCov_9fa48('3170'),
                      {
                        planId,
                      }),
                  select: stryMutAct_9fa48('3171')
                    ? {}
                    : (stryCov_9fa48('3171'),
                      {
                        userId: stryMutAct_9fa48('3172') ? false : (stryCov_9fa48('3172'), true),
                      }),
                })
          )
        ).map(stryMutAct_9fa48('3173') ? () => undefined : (stryCov_9fa48('3173'), (i) => i.userId))
      );
      const interviews = stryMutAct_9fa48('3174')
        ? ['Stryker was here']
        : (stryCov_9fa48('3174'), []);
      for (const invitee of invitees) {
        if (stryMutAct_9fa48('3175')) {
          {
          }
        } else {
          stryCov_9fa48('3175');
          if (
            stryMutAct_9fa48('3177')
              ? false
              : stryMutAct_9fa48('3176')
                ? true
                : (stryCov_9fa48('3176', '3177'), existingUserIds.has(invitee.userId))
          ) {
            if (stryMutAct_9fa48('3178')) {
              {
              }
            } else {
              stryCov_9fa48('3178');
              stryMutAct_9fa48('3179') ? result.failed-- : (stryCov_9fa48('3179'), result.failed++);
              result.errors.push(
                stryMutAct_9fa48('3180')
                  ? ``
                  : (stryCov_9fa48('3180'), `User ${invitee.userId} already exists in plan`)
              );
              continue;
            }
          }
          interviews.push(
            stryMutAct_9fa48('3181')
              ? {}
              : (stryCov_9fa48('3181'),
                {
                  userId: invitee.userId,
                  templateId: plan.templateId,
                  planId: planId,
                  status: 'PENDING' as const,
                })
          );
        }
      }
      if (
        stryMutAct_9fa48('3185')
          ? interviews.length <= 0
          : stryMutAct_9fa48('3184')
            ? interviews.length >= 0
            : stryMutAct_9fa48('3183')
              ? false
              : stryMutAct_9fa48('3182')
                ? true
                : (stryCov_9fa48('3182', '3183', '3184', '3185'), interviews.length > 0)
      ) {
        if (stryMutAct_9fa48('3186')) {
          {
          }
        } else {
          stryCov_9fa48('3186');
          await this.prisma.interview.createMany(
            stryMutAct_9fa48('3187')
              ? {}
              : (stryCov_9fa48('3187'),
                {
                  data: interviews,
                })
          );
          result.success = interviews.length;
        }
      }
      await this.prisma.interviewPlan.update(
        stryMutAct_9fa48('3188')
          ? {}
          : (stryCov_9fa48('3188'),
            {
              where: stryMutAct_9fa48('3189')
                ? {}
                : (stryCov_9fa48('3189'),
                  {
                    id: planId,
                  }),
              data: stryMutAct_9fa48('3190')
                ? {}
                : (stryCov_9fa48('3190'),
                  {
                    inviteeData: invitees as unknown as Prisma.InputJsonValue,
                    status: PlanStatus.READY,
                  }),
            })
      );
      info(
        stryMutAct_9fa48('3191') ? '' : (stryCov_9fa48('3191'), 'Invitees imported'),
        stryMutAct_9fa48('3192')
          ? {}
          : (stryCov_9fa48('3192'),
            {
              planId,
              success: result.success,
              failed: result.failed,
            })
      );
      return result;
    }
  }
  async sendInvitations(planId: string): Promise<{
    sent: number;
    failed: number;
  }> {
    if (stryMutAct_9fa48('3193')) {
      {
      }
    } else {
      stryCov_9fa48('3193');
      const plan = await this.prisma.interviewPlan.findUnique(
        stryMutAct_9fa48('3194')
          ? {}
          : (stryCov_9fa48('3194'),
            {
              where: stryMutAct_9fa48('3195')
                ? {}
                : (stryCov_9fa48('3195'),
                  {
                    id: planId,
                  }),
              include: stryMutAct_9fa48('3196')
                ? {}
                : (stryCov_9fa48('3196'),
                  {
                    interviews: stryMutAct_9fa48('3197')
                      ? {}
                      : (stryCov_9fa48('3197'),
                        {
                          where: stryMutAct_9fa48('3198')
                            ? {}
                            : (stryCov_9fa48('3198'),
                              {
                                status: stryMutAct_9fa48('3199')
                                  ? ''
                                  : (stryCov_9fa48('3199'), 'PENDING'),
                              }),
                        }),
                  }),
            })
      );
      if (
        stryMutAct_9fa48('3202')
          ? false
          : stryMutAct_9fa48('3201')
            ? true
            : stryMutAct_9fa48('3200')
              ? plan
              : (stryCov_9fa48('3200', '3201', '3202'), !plan)
      ) {
        if (stryMutAct_9fa48('3203')) {
          {
          }
        } else {
          stryCov_9fa48('3203');
          throw new Error(
            stryMutAct_9fa48('3204') ? `` : (stryCov_9fa48('3204'), `Plan not found: ${planId}`)
          );
        }
      }
      let sent = 0;
      let failed = 0;
      for (const interview of plan.interviews) {
        if (stryMutAct_9fa48('3205')) {
          {
          }
        } else {
          stryCov_9fa48('3205');
          try {
            if (stryMutAct_9fa48('3206')) {
              {
              }
            } else {
              stryCov_9fa48('3206');
              await this.sendInvitation(interview.userId, plan.name);
              stryMutAct_9fa48('3207') ? sent-- : (stryCov_9fa48('3207'), sent++);
            }
          } catch (err) {
            if (stryMutAct_9fa48('3208')) {
              {
              }
            } else {
              stryCov_9fa48('3208');
              stryMutAct_9fa48('3209') ? failed-- : (stryCov_9fa48('3209'), failed++);
              error(
                stryMutAct_9fa48('3210')
                  ? ''
                  : (stryCov_9fa48('3210'), 'Failed to send invitation'),
                stryMutAct_9fa48('3211')
                  ? {}
                  : (stryCov_9fa48('3211'),
                    {
                      planId,
                      userId: interview.userId,
                      error: err instanceof Error ? err.message : String(err),
                    })
              );
            }
          }
        }
      }
      await this.prisma.interviewPlan.update(
        stryMutAct_9fa48('3212')
          ? {}
          : (stryCov_9fa48('3212'),
            {
              where: stryMutAct_9fa48('3213')
                ? {}
                : (stryCov_9fa48('3213'),
                  {
                    id: planId,
                  }),
              data: stryMutAct_9fa48('3214')
                ? {}
                : (stryCov_9fa48('3214'),
                  {
                    status: PlanStatus.RUNNING,
                    sentCount: stryMutAct_9fa48('3215')
                      ? {}
                      : (stryCov_9fa48('3215'),
                        {
                          increment: sent,
                        }),
                    failedCount: stryMutAct_9fa48('3216')
                      ? {}
                      : (stryCov_9fa48('3216'),
                        {
                          increment: failed,
                        }),
                    startedAt: stryMutAct_9fa48('3219')
                      ? plan.startedAt && new Date()
                      : stryMutAct_9fa48('3218')
                        ? false
                        : stryMutAct_9fa48('3217')
                          ? true
                          : (stryCov_9fa48('3217', '3218', '3219'), plan.startedAt || new Date()),
                  }),
            })
      );
      info(
        stryMutAct_9fa48('3220') ? '' : (stryCov_9fa48('3220'), 'Invitations sent'),
        stryMutAct_9fa48('3221')
          ? {}
          : (stryCov_9fa48('3221'),
            {
              planId,
              sent,
              failed,
            })
      );
      return stryMutAct_9fa48('3222')
        ? {}
        : (stryCov_9fa48('3222'),
          {
            sent,
            failed,
          });
    }
  }
  private async sendInvitation(userId: string, planName: string): Promise<void> {
    if (stryMutAct_9fa48('3223')) {
      {
      }
    } else {
      stryCov_9fa48('3223');
      await messageSender.sendTextMessage(
        stryMutAct_9fa48('3224') ? [] : (stryCov_9fa48('3224'), [userId]),
        stryMutAct_9fa48('3225')
          ? ``
          : (stryCov_9fa48('3225'),
            `您被邀请参与「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息（如"你好"或"开始"）即可开始访谈。`)
      );
    }
  }
  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    if (stryMutAct_9fa48('3226')) {
      {
      }
    } else {
      stryCov_9fa48('3226');
      const updateData: Record<string, unknown> = stryMutAct_9fa48('3227')
        ? {}
        : (stryCov_9fa48('3227'),
          {
            status,
          });
      if (
        stryMutAct_9fa48('3230')
          ? status !== PlanStatus.COMPLETED
          : stryMutAct_9fa48('3229')
            ? false
            : stryMutAct_9fa48('3228')
              ? true
              : (stryCov_9fa48('3228', '3229', '3230'), status === PlanStatus.COMPLETED)
      ) {
        if (stryMutAct_9fa48('3231')) {
          {
          }
        } else {
          stryCov_9fa48('3231');
          updateData.completedAt = new Date();
        }
      }
      await this.prisma.interviewPlan.update(
        stryMutAct_9fa48('3232')
          ? {}
          : (stryCov_9fa48('3232'),
            {
              where: stryMutAct_9fa48('3233')
                ? {}
                : (stryCov_9fa48('3233'),
                  {
                    id: planId,
                  }),
              data: updateData,
            })
      );
    }
  }
  async pausePlan(planId: string): Promise<void> {
    if (stryMutAct_9fa48('3234')) {
      {
      }
    } else {
      stryCov_9fa48('3234');
      await this.updatePlanStatus(planId, PlanStatus.PAUSED);
    }
  }
  async resumePlan(planId: string): Promise<void> {
    if (stryMutAct_9fa48('3235')) {
      {
      }
    } else {
      stryCov_9fa48('3235');
      await this.updatePlanStatus(planId, PlanStatus.RUNNING);
    }
  }
  async cancelPlan(planId: string): Promise<void> {
    if (stryMutAct_9fa48('3236')) {
      {
      }
    } else {
      stryCov_9fa48('3236');
      await this.updatePlanStatus(planId, PlanStatus.CANCELLED);
    }
  }
  async disconnect(): Promise<void> {
    if (stryMutAct_9fa48('3237')) {
      {
      }
    } else {
      stryCov_9fa48('3237');
      await this.prisma.$disconnect();
    }
  }
}
