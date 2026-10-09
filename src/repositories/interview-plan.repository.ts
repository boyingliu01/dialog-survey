// @no-test-required: covered by tests/interview-plan-repository.test.ts
import type { PrismaClient } from '../utils/prisma-client.js';

/**
 * Read-side access to InterviewPlan rows for API routes (REQ-181). Query
 * shapes mirror the raw `prisma.interviewPlan.*` calls they replace 1:1.
 */
export class InterviewPlanRepository {
  constructor(private prisma: PrismaClient) {}

  /** Full row lookup — previously `prisma.interviewPlan.findUnique({ where: { id } })`. */
  findById(id: string) {
    return this.prisma.interviewPlan.findUnique({ where: { id } });
  }

  /** Invitee projection — previously `prisma.interviewPlan.findUnique({ where: { id }, select: { inviteeData: true } })`. */
  findInviteeData(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      select: { inviteeData: true },
    });
  }
}
