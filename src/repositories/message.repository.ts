import type { Message, PrismaClient } from '@prisma/client';

export class MessageRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for MessageRepository');
    }
    this.prisma = prisma;
  }

  async create(data: {
    interviewId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    messageId?: string;
    isVoice?: boolean;
    voiceText?: string;
  }): Promise<Message> {
    return this.prisma.message.create({
      data: {
        interviewId: data.interviewId,
        role: data.role,
        content: data.content,
        ...(data.messageId != null ? { messageId: data.messageId } : {}),
        isVoice: data.isVoice || false,
        ...(data.voiceText != null ? { voiceText: data.voiceText } : {}),
      },
    });
  }

  async findByInterview(interviewId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { id },
    });
  }

  async deleteByInterview(interviewId: string): Promise<number> {
    const result = await this.prisma.message.deleteMany({
      where: { interviewId },
    });
    return result.count;
  }
}
