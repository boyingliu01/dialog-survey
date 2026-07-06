import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2EServer } from './helpers/e2e-server.js';

describe('Batch Import (E2E)', () => {
  let server: Awaited<ReturnType<typeof createE2EServer>>;
  let cleanupIds: {
    templates?: string[];
    interviews?: string[];
    interviewPlans?: string[];
  };

  beforeAll(async () => {
    server = await createE2EServer();
  });

  beforeEach(async () => {
    cleanupIds = {};
  });

  afterEach(async () => {
    if (Object.keys(cleanupIds).some((k) => cleanupIds[k as keyof typeof cleanupIds]?.length)) {
      const ids = { ...cleanupIds };
      if (ids.interviews?.length) {
        await server.prisma.analysisReport
          .deleteMany({ where: { interviewId: { in: ids.interviews } } })
          .catch(() => {});
        await server.prisma.analysisFailure
          .deleteMany({ where: { interviewId: { in: ids.interviews } } })
          .catch(() => {});
        await server.prisma.response
          .deleteMany({ where: { interviewId: { in: ids.interviews } } })
          .catch(() => {});
        await server.prisma.message
          .deleteMany({ where: { interviewId: { in: ids.interviews } } })
          .catch(() => {});
        await server.prisma.interview
          .deleteMany({ where: { id: { in: ids.interviews } } })
          .catch(() => {});
      }
      if (ids.interviewPlans?.length) {
        await server.prisma.interviewPlan
          .deleteMany({ where: { id: { in: ids.interviewPlans } } })
          .catch(() => {});
      }
      if (ids.templates?.length) {
        await server.prisma.template
          .deleteMany({ where: { id: { in: ids.templates } } })
          .catch(() => {});
      }
    }
  });

  afterAll(async () => {
    await server.teardown();
  });

  it('should batch import members: create template, plan, and interviews', async () => {
    const prisma = server.prisma;

    const template = await prisma.template.create({
      data: {
        name: '批量导入测试模板',
        content: JSON.stringify({
          name: '批量导入测试模板',
          invitationPrompt: '欢迎参与批量导入测试！',
          questions: ['问题1：请介绍您的工作', '问题2：您最大的收获是什么？'],
          closingMessage: '感谢参与！',
        }),
        status: 'PUBLISHED',
      },
    });
    cleanupIds.templates = [...(cleanupIds.templates || []), template.id];

    const plan = await prisma.interviewPlan.create({
      data: { name: '批量导入计划', templateId: template.id, status: 'PENDING' },
    });
    cleanupIds.interviewPlans = [...(cleanupIds.interviewPlans || []), plan.id];

    const members = [
      { userId: 'user_zhangsan', name: '张三' },
      { userId: 'user_lisi', name: '李四' },
      { userId: 'user_wangwu', name: '王五' },
    ];

    const interviewIds: string[] = [];
    for (const member of members) {
      const interview = await prisma.interview.create({
        data: {
          userId: member.userId,
          templateId: template.id,
          planId: plan.id,
          status: 'PENDING',
        },
      });
      interviewIds.push(interview.id);
    }
    cleanupIds.interviews = [...(cleanupIds.interviews || []), ...interviewIds];

    const planInterviews = await prisma.interview.findMany({ where: { planId: plan.id } });
    expect(planInterviews).toHaveLength(3);

    const updatedPlan = await prisma.interviewPlan.findUnique({
      where: { id: plan.id },
    });
    expect(updatedPlan).not.toBeNull();
  });

  it('should create a plan and simulate the invitee import flow', async () => {
    const prisma = server.prisma;

    const template = await prisma.template.create({
      data: {
        name: '导入流程测试模板',
        content: JSON.stringify({
          name: '导入流程测试',
          invitationPrompt: '欢迎！',
          questions: ['请介绍您的工作'],
        }),
        status: 'PUBLISHED',
      },
    });
    cleanupIds.templates = [...(cleanupIds.templates || []), template.id];

    const plan = await prisma.interviewPlan.create({
      data: { name: '导入流程计划', templateId: template.id, status: 'PENDING' },
    });
    cleanupIds.interviewPlans = [...(cleanupIds.interviewPlans || []), plan.id];

    const invitees = [
      { userId: 'user_zhangsan', name: '张三' },
      { userId: 'user_lisi', name: '李四' },
    ];

    await prisma.$transaction(async (tx) => {
      for (const invitee of invitees) {
        await tx.interview.create({
          data: {
            userId: invitee.userId,
            templateId: template.id,
            planId: plan.id,
            status: 'PENDING',
          },
        });
      }
      await tx.interviewPlan.update({
        where: { id: plan.id },
        data: { inviteeData: invitees },
      });
    });

    const updatedPlan = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
    expect(updatedPlan?.inviteeData).toBeDefined();
    const data = updatedPlan?.inviteeData as { userId: string; name: string }[];
    expect(data).toHaveLength(2);

    const interviews = await prisma.interview.findMany({ where: { planId: plan.id } });
    expect(interviews).toHaveLength(2);
    cleanupIds.interviews = [...(cleanupIds.interviews || []), ...interviews.map((i) => i.id)];
  });
});
