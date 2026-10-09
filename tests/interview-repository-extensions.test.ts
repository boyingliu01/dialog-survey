import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InterviewRepository } from '../src/repositories/interview.repository.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

// Fixtures for the three report-detail read methods migrated out of
// src/api/admin-templates.ts (issue #181): each mirrors the exact select
// projection the route previously issued inline.
let prisma: PrismaClient;
let repo: InterviewRepository;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
  repo = new InterviewRepository(prisma);
});

describe('InterviewRepository report-detail readers (from admin-templates routes)', () => {
  let templateId: string;
  let planId: string;
  let interviewId: string;

  beforeAll(async () => {
    const template = await prisma.template.create({
      data: {
        name: 'Test Interview Repo Extensions Template',
        description: 'fixture',
        content: JSON.stringify({ questions: ['Q1'] }),
      },
    });
    templateId = template.id;

    const plan = await prisma.interviewPlan.create({
      data: {
        templateId,
        name: 'Test Interview Repo Extensions Plan',
        inviteeData: [{ userId: 'user-repo-ext', name: '李四' }],
      },
    });
    planId = plan.id;

    const interview = await prisma.interview.create({
      data: {
        userId: 'user-repo-ext',
        templateId,
        status: 'COMPLETED',
        planId,
        completedAt: new Date(),
      },
    });
    interviewId = interview.id;

    await prisma.message.create({
      data: {
        interviewId,
        role: 'assistant',
        content: '您好！欢迎参与本次访谈。',
      },
    });
    await prisma.response.create({
      data: {
        interviewId,
        questionId: 'q-1',
        content: '回答内容',
        isFollowup: false,
        followupDepth: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.response.deleteMany({ where: { interviewId } });
    await prisma.message.deleteMany({ where: { interviewId } });
    await prisma.interview.deleteMany({ where: { id: interviewId } });
    await prisma.interviewPlan.deleteMany({ where: { id: planId } });
    await prisma.template.deleteMany({ where: { id: templateId } });
    await prisma.$disconnect();
  });

  describe('findByIdForReportDetail', () => {
    it('returns interview with template content, messages and responses ordered by createdAt asc', async () => {
      const interview = await repo.findByIdForReportDetail(interviewId);
      expect(interview).not.toBeNull();
      expect(interview?.userId).toBe('user-repo-ext');
      expect(interview?.completedAt).not.toBeNull();
      expect(interview?.template?.content).toContain('Q1');
      expect(interview?.messages).toHaveLength(1);
      expect(interview?.messages?.[0]?.content).toBe('您好！欢迎参与本次访谈。');
      expect(interview?.responses).toHaveLength(1);
      expect(interview?.responses?.[0]?.questionId).toBe('q-1');
    });

    it('returns null for a missing id', async () => {
      expect(await repo.findByIdForReportDetail('no-such-interview')).toBeNull();
    });
  });

  describe('findByIdForReportExport', () => {
    it('returns interview with messages only (no template, no responses)', async () => {
      const interview = await repo.findByIdForReportExport(interviewId);
      expect(interview).not.toBeNull();
      expect(interview?.planId).toBe(planId);
      expect(interview?.messages).toHaveLength(1);
    });

    it('returns null for a missing id', async () => {
      expect(await repo.findByIdForReportExport('no-such-interview')).toBeNull();
    });
  });

  describe('findByIdForAnalysisView', () => {
    it('returns interview with createdAt and messages but no template/responses/completedAt', async () => {
      const interview = await repo.findByIdForAnalysisView(interviewId);
      expect(interview).not.toBeNull();
      expect(interview?.createdAt).toBeInstanceOf(Date);
      expect(interview?.messages).toHaveLength(1);
    });

    it('returns null for a missing id', async () => {
      expect(await repo.findByIdForAnalysisView('no-such-interview')).toBeNull();
    });
  });
});
