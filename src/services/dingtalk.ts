import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../config.js';

// DingTalk webhook message schema
const DingTalkMessageSchema = z.object({
  msgtype: z.string(),
  text: z.object({ content: z.string() }).optional(),
  content: z.object({ text: z.string() }).optional(),
  voice: z.object({
    media_id: z.string(),
    duration: z.number().optional(),
    recognition: z.string().optional(),
  }).optional(),
  senderStaffId: z.string().optional(),
  senderId: z.string().optional(),
  conversationId: z.string().optional(),
  chatbotUserId: z.string().optional(),
  sessionWebhook: z.string().optional(),
  sessionWebhookExpiredTime: z.number().optional(),
});

export type DingTalkMessage = z.infer<typeof DingTalkMessageSchema>;

export interface ParsedMessage {
  msg_type: string;
  user_id: string;
  content: string;
  media_id?: string;
  conversation_id?: string;
}

export class DingTalkService {
  private readonly appSecret: string;

  constructor(_appKey: string, appSecret: string, _agentId: string) {
    this.appSecret = appSecret;
  }

  /**
   * Verify DingTalk webhook signature
   */
  verifySignature(timestamp: string, signature: string, nonce: string): boolean {
    const signString = `${timestamp}\n${nonce}`;
    const hmac = crypto.createHmac('sha256', this.appSecret);
    const calculatedSignature = hmac.update(signString).digest('base64');
    return calculatedSignature === signature;
  }

  /**
   * Parse DingTalk webhook message
   */
  parseWebhookMessage(body: unknown): ParsedMessage {
    const parsed = DingTalkMessageSchema.parse(body);

    const msg_type = parsed.msgtype || 'text';
    const user_id = parsed.senderStaffId || parsed.senderId || '';
    let content = '';
    let media_id: string | undefined;

    if (msg_type === 'text') {
      content = parsed.text?.content || parsed.content?.text || '';
    } else if (msg_type === 'voice') {
      media_id = parsed.voice?.media_id;
      content = parsed.voice?.recognition || '';
    }

    return {
      msg_type,
      user_id,
      content,
      media_id,
      conversation_id: parsed.conversationId,
    };
  }

  /**
   * Send text message to DingTalk
   */
  async sendTextMessage(webhookUrl: string, content: string): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content },
        }),
      });

      if (!response.ok) {
        console.error('Failed to send DingTalk message:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error sending DingTalk message:', error);
    }
  }

  /**
   * Send message to conversation (placeholder for now)
   */
  async sendToConversation(conversationId: string, msg: any): Promise<void> {
    console.log(`Would send message to conversation ${conversationId}:`, msg);
    // Placeholder - actual implementation would use DingTalk API
  }

  /**
   * Send message to user (placeholder for now)
   */
  async sendToUser(userId: string, msg: any): Promise<void> {
    console.log(`Would send message to user ${userId}:`, msg);
    // Placeholder - actual implementation would use DingTalk API
  }
}

// Singleton instance
let dingtalkServiceInstance: DingTalkService | null = null;

export function getDingtalkService(): DingTalkService {
  if (!dingtalkServiceInstance) {
    dingtalkServiceInstance = new DingTalkService(
      config.DINGTALK_APP_KEY,
      config.DINGTALK_APP_SECRET,
      config.DINGTALK_AGENT_ID,
    );
  }
  return dingtalkServiceInstance;
}
