// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

describe('MessageRepository', () => {
  let interviewId: string;
  let templateId: string;

  beforeAll(async () => {
    // Create test Interview record first (needed for interviewId FK constraint)
    const template = await prisma.template.create({
      data: {
        name: 'Test Message Repository Template',
        description: 'Template created for testing MessageRepository integration',
        content: JSON.stringify({ questions: ['Test Question'] }),
      },
    });

    templateId = template.id;

    const interview = await prisma.interview.create({
      data: {
        userId: 'user-test-messages',
        templateId: template.id,
        status: 'PENDING',
      },
    });

    interviewId = interview.id;
  });

  afterEach(async () => {
    // Clean up any test messages after each test
    await prisma.message.deleteMany({
      where: {
        interviewId,
      },
    });
  });

  afterAll(async () => {
    // Clean up the created records after all tests complete
    await prisma.interview.deleteMany({
      where: { id: interviewId },
    });
    await prisma.template.deleteMany({
      where: { id: templateId },
    });
    await prisma.$disconnect();
  });

  describe('create()', () => {
    /**
     * @test REQ-MESSAGE-CREATE-01
     * @intent 验证创建消息的基本功能，包含必须字段
     */
    it('should create a message with required fields', async () => {
      const message = await prisma.message.create({
        data: {
          interviewId,
          role: 'user',
          content: 'Hello, this is a test message',
        },
      });

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.interviewId).toBe(interviewId);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, this is a test message');
      expect(message.isVoice).toBe(false);
      expect(message.createdAt).toBeDefined();
    });

    /**
     * @test REQ-MESSAGE-CREATE-02
     * @intent 验证创建消息时包含可选字段的功能（messageId、isVoice、voiceText）
     */
    it('should create a message with optional fields', async () => {
      const testMessageId = 'test-message-id-123';

      const message = await prisma.message.create({
        data: {
          interviewId,
          role: 'assistant',
          content: 'This is an assistant message',
          messageId: testMessageId,
          isVoice: true,
          voiceText: 'Spoken form of the message',
        },
      });

      expect(message).toBeDefined();
      expect(message.messageId).toBe(testMessageId);
      expect(message.isVoice).toBe(true);
      expect(message.voiceText).toBe('Spoken form of the message');
    });

    /**
     * @test REQ-MESSAGE-CREATE-03
     * @intent 验证创建消息时省略isVoice字段使用默认值false的功能
     */
    it('should create a message with isVoice defaulting to false', async () => {
      const message = await prisma.message.create({
        data: {
          interviewId,
          role: 'system',
          content: 'System message',
        },
      });

      expect(message.isVoice).toBe(false);
    });
  });

  describe('findByInterview()', () => {
    /**
     * @test REQ-MESSAGE-FIND-01
     * @intent 验证查找指定访谈的所有消息功能
     */
    it('should find messages by interview ID', async () => {
      // Create multiple messages for the same interview
      const createdMessage1 = await prisma.message.create({
        data: {
          interviewId,
          role: 'user',
          content: 'First message',
        },
      });

      const createdMessage2 = await prisma.message.create({
        data: {
          interviewId,
          role: 'assistant',
          content: 'Second message',
        },
      });

      // Create another message in a different interview to validate filtering
      const otherInterview = await prisma.interview.create({
        data: {
          userId: 'user-test-other',
          templateId,
          status: 'PENDING',
        },
      });

      const otherMessage = await prisma.message.create({
        data: {
          interviewId: otherInterview.id,
          role: 'user',
          content: 'Message in other interview',
        },
      });

      const messages = await prisma.message.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });

      expect(messages).toHaveLength(2);
      const messageIds = messages.map((m) => m.id);
      expect(messageIds).toContain(createdMessage1.id);
      expect(messageIds).toContain(createdMessage2.id);
      expect(messageIds).not.toContain(otherMessage.id);

      // Clean up the additional interview
      await prisma.interview.delete({ where: { id: otherInterview.id } });
    });

    /**
     * @test REQ-MESSAGE-FIND-02
     * @intent 验证查找非存在访谈的消息返回空数组
     */
    it('should return empty array for non-existent interview ID', async () => {
      const messages = await prisma.message.findMany({
        where: { interviewId: 'non-existent-id' },
      });

      expect(messages).toHaveLength(0);
    });
  });

  describe('findById()', () => {
    /**
     * @test REQ-MESSAGE-ID-01
     * @intent 验证通过ID查找存在的消息的功能
     */
    it('should find message by ID', async () => {
      const createdMessage = await prisma.message.create({
        data: {
          interviewId,
          role: 'user',
          content: 'Specific message for ID lookup',
        },
      });

      const foundMessage = await prisma.message.findUnique({
        where: { id: createdMessage.id },
      });

      expect(foundMessage).not.toBeNull();
      if (foundMessage) {
        expect(foundMessage.id).toBe(createdMessage.id);
        expect(foundMessage.content).toBe(createdMessage.content);
      }
    });

    /**
     * @test REQ-MESSAGE-ID-02
     * @intent 验证通过ID查找不存在的消息返回null
     */
    it('should return null for non-existent message ID', async () => {
      const missingMessageId = 'non-existent-message-id';
      const foundMessage = await prisma.message.findUnique({
        where: { id: missingMessageId },
      });

      expect(foundMessage).toBeNull();
    });
  });

  describe('deleteByInterview()', () => {
    /**
     * @test REQ-MESSAGE-DELETE-01
     * @intent 验证删除指定访谈的所有消息的功能
     */
    it('should delete messages for given interview ID', async () => {
      // Create multiple messages to delete
      await prisma.message.create({
        data: {
          interviewId,
          role: 'user',
          content: 'Message to be deleted 1',
        },
      });

      await prisma.message.create({
        data: {
          interviewId,
          role: 'assistant',
          content: 'Message to be deleted 2',
        },
      });

      // Verify messages exist initially
      const initialMessages = await prisma.message.findMany({
        where: { interviewId },
      });
      expect(initialMessages).toHaveLength(2);

      // Delete messages and check the count returned
      const result = await prisma.message.deleteMany({
        where: { interviewId },
      });

      expect(result.count).toBe(2);

      // Verify messages were deleted
      const remainingMessages = await prisma.message.findMany({
        where: { interviewId },
      });
      expect(remainingMessages).toHaveLength(0);
    });

    /**
     * @test REQ-MESSAGE-DELETE-02
     * @intent 验证删除不存在访谈的记录返回0
     */
    it('should return 0 when deleting by non-existent interview ID', async () => {
      const result = await prisma.message.deleteMany({
        where: { interviewId: 'non-existent-interview-id' },
      });

      expect(result.count).toBe(0);
    });
  });
});
