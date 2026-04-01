/* eslint-disable @typescript-eslint/no-extraneous-class */
import { prisma } from "../db";
import {
  Interview,
  InterviewStatus,
  Message,
  Prisma,
} from "../generated/prisma/client/client.js";

type JsonInput = Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;

export interface CreateInterviewData {
  sessionId: string;
  userId: string;
  templateId: string;
  topic?: string;
  conversationHistory?: JsonInput;
  extractedInfo?: JsonInput;
}

export interface UpdateInterviewData {
  status?: InterviewStatus;
  topic?: string;
  conversationHistory?: JsonInput;
  extractedInfo?: JsonInput;
  report?: string;
  reportPath?: string;
}

export interface UpdateWithVersionData extends UpdateInterviewData {
  version: number;
}

type InterviewWithMessages = Interview & { messages: Message[] };

export class OptimisticLockError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Optimistic lock failed: expected version ${expectedVersion}, but was ${actualVersion}`,
    );
    this.name = "OptimisticLockError";
  }
}

export class InterviewRepository {
  private constructor() {}

  static async create(data: CreateInterviewData): Promise<Interview> {
    const createData: Prisma.InterviewCreateInput = {
      sessionId: data.sessionId,
      userId: data.userId,
      templateId: data.templateId,
      ...(data.topic && { topic: data.topic }),
      ...(data.conversationHistory !== undefined && {
        conversationHistory: data.conversationHistory as Prisma.InputJsonValue,
      }),
      ...(data.extractedInfo !== undefined && {
        extractedInfo: data.extractedInfo as Prisma.InputJsonValue,
      }),
    };
    return prisma.interview.create({ data: createData });
  }

  static async findActiveByUserId(
    userId: string,
  ): Promise<InterviewWithMessages | null> {
    return prisma.interview.findFirst({
      where: {
        userId,
        status: InterviewStatus.IN_PROGRESS,
      },
      include: { messages: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateHistory(
    id: string,
    conversationHistory: JsonInput,
  ): Promise<InterviewWithMessages> {
    return prisma.interview.update({
      where: { id },
      data: {
        conversationHistory: conversationHistory as Prisma.InputJsonValue,
      },
      include: { messages: true },
    }) as Promise<InterviewWithMessages>;
  }

  static async complete(
    id: string,
    data: {
      report?: string;
      reportPath?: string;
      extractedInfo?: JsonInput;
    },
  ): Promise<InterviewWithMessages> {
    return prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.COMPLETED,
        report: data.report,
        reportPath: data.reportPath,
        extractedInfo: data.extractedInfo as Prisma.InputJsonValue,
      },
      include: { messages: true },
    }) as Promise<InterviewWithMessages>;
  }

  static async findById(id: string): Promise<InterviewWithMessages | null> {
    return prisma.interview.findUnique({
      where: { id },
      include: { messages: true },
    });
  }

  static async findBySessionId(
    sessionId: string,
  ): Promise<InterviewWithMessages | null> {
    return prisma.interview.findUnique({
      where: { sessionId },
      include: { messages: true },
    });
  }

  static async findByUserId(
    userId: string,
    status?: InterviewStatus,
  ): Promise<InterviewWithMessages[]> {
    const where: Prisma.InterviewWhereInput = { userId };
    if (status) {
      where.status = status;
    }
    return prisma.interview.findMany({
      where,
      include: { messages: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findAll(
    status?: InterviewStatus,
    limit = 100,
    offset = 0,
  ): Promise<InterviewWithMessages[]> {
    const where: Prisma.InterviewWhereInput = {};
    if (status) {
      where.status = status;
    }
    return prisma.interview.findMany({
      where,
      include: { messages: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async update(
    id: string,
    data: UpdateInterviewData,
  ): Promise<InterviewWithMessages> {
    const updateData: Prisma.InterviewUpdateInput = {
      ...(data.status && { status: data.status }),
      ...(data.topic !== undefined && { topic: data.topic }),
      ...(data.conversationHistory !== undefined && {
        conversationHistory: data.conversationHistory as Prisma.InputJsonValue,
      }),
      ...(data.extractedInfo !== undefined && {
        extractedInfo: data.extractedInfo as Prisma.InputJsonValue,
      }),
      ...(data.report !== undefined && { report: data.report }),
      ...(data.reportPath !== undefined && { reportPath: data.reportPath }),
    };
    return prisma.interview.update({
      where: { id },
      data: updateData,
      include: { messages: true },
    }) as Promise<InterviewWithMessages>;
  }

  static async updateWithVersion(
    id: string,
    data: UpdateWithVersionData,
  ): Promise<InterviewWithMessages> {
    const result = await prisma.interview.updateMany({
      where: {
        id,
        version: data.version,
      },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.topic !== undefined && { topic: data.topic }),
        ...(data.conversationHistory !== undefined && {
          conversationHistory:
            data.conversationHistory as Prisma.InputJsonValue,
        }),
        ...(data.extractedInfo !== undefined && {
          extractedInfo: data.extractedInfo as Prisma.InputJsonValue,
        }),
        ...(data.report !== undefined && { report: data.report }),
        ...(data.reportPath !== undefined && { reportPath: data.reportPath }),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await prisma.interview.findUnique({
        where: { id },
        select: { version: true },
      });
      throw new OptimisticLockError(data.version, current?.version ?? -1);
    }

    return this.findById(id) as Promise<InterviewWithMessages>;
  }

  static async delete(id: string): Promise<Interview> {
    return prisma.interview.delete({
      where: { id },
    });
  }

  static async countByStatus(status: InterviewStatus): Promise<number> {
    return prisma.interview.count({
      where: { status },
    });
  }

  static async exists(id: string): Promise<boolean> {
    const count = await prisma.interview.count({
      where: { id },
    });
    return count > 0;
  }

  static async withTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(fn);
  }
}
