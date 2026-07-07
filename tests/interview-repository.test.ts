import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InterviewRepository } from '../src/repositories/interview.repository.js';

const prisma = new PrismaClient();
const repo = new InterviewRepository(prisma);

describe('InterviewRepository', () => {
  let templateId: string;
  let planId: string;
  let interviewId: string;

  beforeAll(async () => {
    // Create test Template
    const template = await prisma.template.create({
      data: {
        name: 'Test Interview Repository Template',
        description: 'Template created for testing InterviewRepository integration',
        content: JSON.stringify({ questions: ['Test Question'] }),
      },
    });
    templateId = template.id;

    // Create test InterviewPlan
    const plan = await prisma.interviewPlan.create({
      data: {
        templateId,
        name: 'Test Interview Plan',
      },
    });
    planId = plan.id;

    // Create test Interview
    const interview = await prisma.interview.create({
      data: {
        userId: 'user-test-interview-repo',
        templateId,
        status: 'PENDING',
        planId,
      },
    });
    interviewId = interview.id;
  });

  afterAll(async () => {
    // Clean up all created records
    await prisma.interview.deleteMany({
      where: { id: interviewId },
    });
    await prisma.interviewPlan.deleteMany({
      where: { id: planId },
    });
    await prisma.template.deleteMany({
      where: { id: templateId },
    });
    await prisma.$disconnect();
  });

  describe('countByStatusForTemplate()', () => {
    /**
     * @test REQ-INT-REPO-01
     * @intent 验证按模板统计不同状态访谈数量的功能
     */
    it('should count interviews by status for a template', async () => {
      // Create additional interviews with different statuses
      const interview1 = await prisma.interview.create({
        data: {
          userId: 'user-status-test-1',
          templateId,
          status: 'ACTIVE',
        },
      });

      const interview2 = await prisma.interview.create({
        data: {
          userId: 'user-status-test-2',
          templateId,
          status: 'COMPLETED',
        },
      });

      const interview3 = await prisma.interview.create({
        data: {
          userId: 'user-status-test-3',
          templateId,
          status: 'PENDING',
        },
      });

      const { counts, total } = await repo.countByStatusForTemplate(templateId);

      // Verify counts include all statuses
      expect(counts['PENDING']).toBeDefined();
      expect(counts['ACTIVE']).toBeDefined();
      expect(counts['COMPLETED']).toBeDefined();

      // Verify total count
      expect(total).toBeGreaterThanOrEqual(4); // Original + 3 new

      // Clean up additional interviews
      await prisma.interview.deleteMany({
        where: { id: { in: [interview1.id, interview2.id, interview3.id] } },
      });
    });

    /**
     * @test REQ-INT-REPO-02
     * @intent 验证模板无访谈时返回空计数和总数 0
     */
    it('should return empty counts and total 0 for template with no interviews', async () => {
      const { counts, total } = await repo.countByStatusForTemplate('non-existent-template-id');

      expect(counts).toEqual({});
      expect(total).toBe(0);
    });
  });

  describe('findByPlanId()', () => {
    /**
     * @test REQ-INT-REPO-03
     * @intent 验证按规划 ID 查找所有访谈的功能
     */
    it('should find all interviews for a plan ID', async () => {
      // Create additional interviews for the same plan
      const interview1 = await prisma.interview.create({
        data: {
          userId: 'user-plan-test-1',
          templateId,
          status: 'ACTIVE',
          planId,
        },
      });

      const interview2 = await prisma.interview.create({
        data: {
          userId: 'user-plan-test-2',
          templateId,
          status: 'WAITING',
          planId,
        },
      });

      const interviews = await repo.findByPlanId(planId);

      // Verify all interviews for the plan are returned
      expect(interviews.length).toBeGreaterThanOrEqual(3); // Original + 2 new

      // Verify correct fields are returned
      const foundInterviews = interviews.filter((i) =>
        [interviewId, interview1.id, interview2.id].includes(i.id)
      );
      expect(foundInterviews).toHaveLength(3);

      for (const i of foundInterviews) {
        expect(i.id).toBeDefined();
        expect(i.userId).toBeDefined();
        expect(i.status).toBeDefined();
        expect(i.completedAt).toBeNull(); // Not completed yet
      }

      // Clean up additional interviews
      await prisma.interview.deleteMany({
        where: { id: { in: [interview1.id, interview2.id] } },
      });
    });

    /**
     * @test REQ-INT-REPO-04
     * @intent 验证非存在规划 ID 返回空数组
     */
    it('should return empty array for non-existent plan ID', async () => {
      const interviews = await repo.findByPlanId('non-existent-plan-id');

      expect(interviews).toEqual([]);
    });
  });

  describe('findByIdForReport()', () => {
    /**
     * @test REQ-INT-REPO-05
     * @intent 验证通过 ID 查找访谈用于报告的功能
     */
    it('should find interview by ID for report', async () => {
      const interview = await repo.findByIdForReport(interviewId);

      expect(interview).not.toBeNull();
      if (interview) {
        expect(interview.id).toBe(interviewId);
        expect(interview.userId).toBe('user-test-interview-repo');
        expect(interview.status).toBe('PENDING');
        expect(interview.createdAt).toBeDefined();
        expect(interview.completedAt).toBeNull();
      }
    });

    /**
     * @test REQ-INT-REPO-06
     * @intent 验证通过 ID 查找不存在的访谈返回 null
     */
    it('should return null for non-existent interview ID', async () => {
      const interview = await repo.findByIdForReport('non-existent-interview-id');

      expect(interview).toBeNull();
    });
  });

  describe('findByIdForReportPage()', () => {
    /**
     * @test REQ-INT-REPO-07
     * @intent 验证通过 ID 查找访谈用于报告页面的功能
     */
    it('should find interview by ID for report page', async () => {
      const interview = await repo.findByIdForReportPage(interviewId);

      expect(interview).not.toBeNull();
      if (interview) {
        expect(interview.id).toBe(interviewId);
        expect(interview.userId).toBe('user-test-interview-repo');
        expect(interview.status).toBe('PENDING');
        expect(interview.createdAt).toBeDefined();
      }
    });

    /**
     * @test REQ-INT-REPO-08
     * @intent 验证通过 ID 查找不存在的访谈返回 null
     */
    it('should return null for non-existent interview ID', async () => {
      const interview = await repo.findByIdForReportPage('non-existent-interview-id');

      expect(interview).toBeNull();
    });
  });
});
