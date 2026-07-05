import type { PrismaClient } from '@prisma/client';
import { processStreamMessage } from '../../../src/services/stream-message.service.js';
import type { StreamMessage } from '../../../src/services/stream-message-utils.js';

const USER_MAP: Record<string, { name: string; mobile: string }> = {
  'user_zhangsan': { name: '张三', mobile: '13800138000' },
  'user_lisi': { name: '李四', mobile: '13900139000' },
};

export class MockDingTalk {
  sentMessages: Array<{ userId: string; content: string }> = [];

  getUserIdByMobile(mobile: string) {
    if (mobile === '13800138000') return { found: true, userId: 'user_zhangsan', name: '张三' };
    if (mobile === '13900139000') return { found: true, userId: 'user_lisi', name: '李四' };
    return { found: false };
  }

  getUserByUserId(userId: string) {
    return USER_MAP[userId] ? { userid: userId, ...USER_MAP[userId] } : null;
  }

  /**
   * Simulate a user sending a message through DingTalk.
   * Sends a message through processStreamMessage which handles the full
   * interview graph lifecycle internally.
   */
  async simulateUserMessage(
    prisma: PrismaClient,
    userId: string,
    content: string,
    sessionWebhook?: string,
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const messageId = `msg-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const message: StreamMessage = {
      specVersion: '1.0',
      type: 'CALLBACK',
      headers: {
        topic: '/v1.0/im/bot/messages/get',
        messageId,
        time: new Date().toISOString(),
      },
      data: JSON.stringify({
        senderStaffId: userId,
        text: { content },
        msgtype: 'text',
        sessionWebhook: sessionWebhook || 'https://oapi.dingtalk.com/robot/send?session=test',
      }),
    };

    const result = await processStreamMessage(message, prisma);
    if (result.response) {
      this.sentMessages.push({ userId, content: result.response });
    }
    return result;
  }
}
