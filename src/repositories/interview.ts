import { prisma } from '../db';
import { Interview, InterviewStatus, Message, Prisma } from '@prisma/client';

export interface CreateInterviewData {
  sessionId: string;
  userId: string;
  templateId: string;
  topic?: string;
  conversationHistory?: Prisma.JsonValue;
  extractedInfo?: Prisma.JsonValue;
}

export interface UpdateInterviewData {
  status?: InterviewStatus;
  topic?: string;
  conversationHistory?: Prisma.JsonValue;
  extractedInfo?: Prisma.JsonValue;
  report?: string;
  reportPath?: string;
}

type InterviewWithMessages = Interview & { messages: Message[] };

export class InterviewRepository {
  /**
   * Create a new interview
   */
  static async create(data: CreateInterviewData): Promise<Interview> {
    return prisma.interview.create({
      data,
    });
  }

  /**
   * Find active interview by user ID
   */
  static async findActiveByUserId(userId: string): Promise<InterviewWithMessages | null> {
    return prisma.interview.findFirst({
      where: {
        userId,
        status: InterviewStatus.IN_PROGRESS
      },
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update conversation history
   */
  static async updateHistory(id: string, conversationHistory: Prisma.JsonValue): Promise<InterviewWithMessages> {
    return prisma.interview.update({
      where: { id },
      data: { conversationHistory },
      include: { messages: true },
    });
  }

  /**
   * Complete an interview
   */
  static async complete(id: string, data: {
    report?: string;
    reportPath?: string;
    extractedInfo?: Prisma.JsonValue;
  }): Promise<InterviewWithMessages> {
    return prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.COMPLETED,
        report: data.report,
        reportPath: data.reportPath,
        extractedInfo: data.extractedInfo,
      },
      include: { messages: true },
    });
  }

  /**
   * Find an interview by ID
   */
  static async findById(id: string): Promise<InterviewWithMessages | null> {
    return prisma.interview.findUnique({
      where: { id },
      include: { messages: true },
    });
  }

  /**
   * Find an interview by session ID
   */
  static async findBySessionId(sessionId: string): Promise<InterviewWithMessages | null> {
    return prisma.interview.findUnique({
      where: { sessionId },
      include: { messages: true },
    });
  }

  /**
   * Find all interviews by user ID
   */
  static async findByUserId(userId: string, status?: InterviewStatus): Promise<InterviewWithMessages[]> {
    const where: Prisma.InterviewWhereInput = { userId };
    if (status) {
      where.status = status;
    }
    return prisma.interview.findMany({
      where,
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find all interviews with optional filters
   */
  static async findAll(status?: InterviewStatus, limit = 100, offset = 0): Promise<InterviewWithMessages[]> {
    const where: Prisma.InterviewWhereInput = {};
    if (status) {
      where.status = status;
    }
    return prisma.interview.findMany({
      where,
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Update an interview
   */
  static async update(id: string, data: UpdateInterviewData): Promise<InterviewWithMessages> {
    return prisma.interview.update({
      where: { id },
      data,
      include: { messages: true },
    });
  }

  /**
   * Delete an interview
   */
  static async delete(id: string): Promise<Interview> {
    return prisma.interview.delete({
      where: { id },
    });
  }

  /**
   * Count interviews by status
   */
  static async countByStatus(status: InterviewStatus): Promise<number> {
    return prisma.interview.count({
      where: { status },
    });
  }

  /**
   * Check if an interview exists
   */
  static async exists(id: string): Promise<boolean> {
    const count = await prisma.interview.count({
      where: { id },
    });
    return count > 0;
  }
}
