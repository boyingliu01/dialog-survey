import { prisma } from "../db";
import {
  Message,
  MessageRole,
  Interview,
  Prisma,
} from "../generated/prisma/client/client.js";

export interface CreateMessageData {
  interviewId: string;
  role: MessageRole;
  content: string;
  messageType: string;
}

type MessageWithInterview = Message & { interview: Interview };

export class MessageRepository {
  /**
   * Create a new message
   */
  static async create(data: CreateMessageData): Promise<Message> {
    return prisma.message.create({
      data,
    });
  }

  /**
   * Find a message by ID
   */
  static async findById(id: string): Promise<MessageWithInterview | null> {
    return prisma.message.findUnique({
      where: { id },
      include: { interview: true },
    });
  }

  /**
   * Find all messages by interview ID
   */
  static async findByInterviewId(
    interviewId: string,
    limit = 100,
    offset = 0,
  ): Promise<MessageWithInterview[]> {
    return prisma.message.findMany({
      where: { interviewId },
      include: { interview: true },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find all messages by user ID and interview status
   */
  static async findByUserId(
    userId: string,
    status?: any,
  ): Promise<MessageWithInterview[]> {
    const where: Prisma.MessageWhereInput = { interview: { userId } };
    if (status) {
      where.interview = where.interview || {};
      where.interview.status = status;
    }
    return prisma.message.findMany({
      where,
      include: { interview: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Update a message
   */
  static async update(
    id: string,
    data: Partial<CreateMessageData>,
  ): Promise<Message> {
    return prisma.message.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a message
   */
  static async delete(id: string): Promise<Message> {
    return prisma.message.delete({
      where: { id },
    });
  }

  /**
   * Delete all messages for an interview
   */
  static async deleteByInterviewId(
    interviewId: string,
  ): Promise<Prisma.BatchPayload> {
    return prisma.message.deleteMany({
      where: { interviewId },
    });
  }

  /**
   * Count messages by interview ID
   */
  static async countByInterviewId(interviewId: string): Promise<number> {
    return prisma.message.count({
      where: { interviewId },
    });
  }

  /**
   * Find latest message by interview ID
   */
  static async findLatest(
    interviewId: string,
  ): Promise<MessageWithInterview | null> {
    return prisma.message.findFirst({
      where: { interviewId },
      include: { interview: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Check if a message exists
   */
  static async exists(id: string): Promise<boolean> {
    const count = await prisma.message.count({
      where: { id },
    });
    return count > 0;
  }
}
