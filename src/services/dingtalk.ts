import * as crypto from 'crypto';
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

// Callback message interface for Stream API (moved from ./dingtalk/types.ts)
export interface CallbackMessage {
  msgId: string;
  createAt: number;
  senderStaffId: string;
  conversationId: string;
  conversationType: '1' | '2' | '3';
  senderCorpId: string;
  conversationTitle: string;
  msgtype: string;
  text?: { content: string };
  image?: { media_id: string };
  voice?: { media_id: string; duration: number };
  file?: { media_id: string };
  location?: { title: string; address: string; latitude: number; longitude: number };
  link?: { title: string; text: string; message_url: string; pic_url?: string };
  markdown?: { title: string; text: string };
}

// Message types for sending
interface TextMessage {
  msgtype: 'text';
  text: { content: string };
}

interface MarkdownMessage {
  msgtype: 'markdown';
  markdown: { title: string; text: string };
}

interface LinkMessage {
  msgtype: 'link';
  link: { title: string; text: string; messageUrl: string; picUrl?: string };
}

type OutboundMessage = TextMessage | MarkdownMessage | LinkMessage;

interface TokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

interface SendMessageResponse {
  errcode: number;
  errmsg: string;
  task_id?: number;
}

export class DingTalkService {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly agentId: string;
  private accessToken: string | null = null;
  private accessTokenExpireTime: number = 0;

  constructor(appKey: string, appSecret: string, agentId: string) {
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.agentId = agentId;
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
   * Get access token from DingTalk API with caching
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid
    if (this.accessToken && now < this.accessTokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/gettoken?appkey=${this.appKey}&appsecret=${this.appSecret}`
      );

      const data = (await response.json()) as TokenResponse;

      if (data.errcode !== 0) {
        throw new Error(`Failed to get access token: ${data.errmsg}`);
      }

      this.accessToken = data.access_token || '';
      // Subtract 1 minute to be safe
      this.accessTokenExpireTime = now + ((data.expires_in || 7200) * 1000 - 60000);

      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  /**
   * Send message via DingTalk API
   */
  private async sendMessage(
    params: {
      userid?: string;
      unionid?: string;
      openConversationId?: string;
      cid?: string;
    },
    msg: OutboundMessage
  ): Promise<SendMessageResponse> {
    const accessToken = await this.getAccessToken();

    const queryParams = new URLSearchParams({
      agent_id: this.agentId,
    });
    
    if (params.userid) queryParams.set('userid', params.userid);
    if (params.unionid) queryParams.set('unionid', params.unionid);
    if (params.openConversationId) queryParams.set('openConversationId', params.openConversationId);
    if (params.cid) queryParams.set('cid', params.cid);

    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${accessToken}&${queryParams.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ msg }),
        }
      );

      const data = (await response.json()) as SendMessageResponse;

      if (data.errcode !== 0) {
        throw new Error(`Failed to send message: ${data.errmsg}`);
      }

      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send text message to DingTalk webhook
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
   * Send text message to a user
   */
  async sendTextToUser(userId: string, content: string): Promise<SendMessageResponse> {
    const msg: TextMessage = {
      msgtype: 'text',
      text: { content },
    };
    return this.sendMessage({ userid: userId }, msg);
  }

  /**
   * Send markdown message to a user
   */
  async sendMarkdownToUser(userId: string, title: string, text: string): Promise<SendMessageResponse> {
    const msg: MarkdownMessage = {
      msgtype: 'markdown',
      markdown: { title, text },
    };
    return this.sendMessage({ userid: userId }, msg);
  }

  /**
   * Send text message to a conversation
   */
  async sendTextToConversation(conversationId: string, content: string): Promise<SendMessageResponse> {
    const msg: TextMessage = {
      msgtype: 'text',
      text: { content },
    };
    return this.sendMessage({ cid: conversationId }, msg);
  }

  /**
   * Send markdown message to a conversation
   */
  async sendMarkdownToConversation(conversationId: string, title: string, text: string): Promise<SendMessageResponse> {
    const msg: MarkdownMessage = {
      msgtype: 'markdown',
      markdown: { title, text },
    };
    return this.sendMessage({ cid: conversationId }, msg);
  }

  /**
   * Send message to user (legacy interface - supports text/markdown message objects)
   */
  async sendToUser(userId: string, msg: { msgtype: string; text?: { content: string }; content?: string }): Promise<void> {
    if (msg.msgtype === 'text') {
      const content = msg.text?.content || msg.content || '';
      await this.sendTextToUser(userId, content);
    } else if (msg.msgtype === 'markdown') {
      const content = (msg as any).markdown?.text || msg.text?.content || msg.content || '';
      await this.sendMarkdownToUser(userId, content, content);
    }
  }

  /**
   * Send message to conversation (legacy interface - supports text/markdown message objects)
   */
  async sendToConversation(conversationId: string, msg: { msgtype: string; text?: { content: string }; content?: string }): Promise<void> {
    if (msg.msgtype === 'text') {
      const content = msg.text?.content || msg.content || '';
      await this.sendTextToConversation(conversationId, content);
    } else if (msg.msgtype === 'markdown') {
      const content = (msg as any).markdown?.text || msg.text?.content || msg.content || '';
      await this.sendMarkdownToConversation(conversationId, content, content);
    }
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
