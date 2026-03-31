import * as crypto from 'crypto';
import { DingTalkConfig, DingTalkMessage, DingTalkMessageSchema, SendMessageRequest } from './types';

class DingTalkService {
  private static instance: DingTalkService | null = null;
  private config: DingTalkConfig;
  private accessToken: string | null = null;
  private accessTokenExpireTime: number = 0;

  private constructor(config: DingTalkConfig) {
    this.config = config;
  }

  /**
   * Get singleton instance of DingTalkService
   */
  static getInstance(config: DingTalkConfig): DingTalkService {
    if (!DingTalkService.instance) {
      DingTalkService.instance = new DingTalkService(config);
    }
    return DingTalkService.instance;
  }

  /**
   * Verify DingTalk signature
   */
  verifySignature(signature: string, timestamp: string, nonce: string, encrypt: string): boolean {
    if (!this.config.token || !this.config.aesKey) {
      return false;
    }

    const data = [this.config.token, timestamp, nonce, encrypt].sort().join('');
    const computedSignature = crypto.createHash('sha1').update(data).digest('hex');

    return computedSignature === signature;
  }

  /**
   * Parse and validate DingTalk message
   */
  parseMessage(rawData: unknown): DingTalkMessage | null {
    try {
      return DingTalkMessageSchema.parse(rawData);
    } catch (error) {
      console.error('Failed to parse DingTalk message:', error);
      return null;
    }
  }

  /**
   * Get access token from DingTalk API with caching
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid
    if (this.accessToken && now < this.accessTokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/gettoken?appkey=${this.config.appKey}&appsecret=${this.config.appSecret}`
      );

      const data: any = await response.json();

      if (data.errcode !== 0) {
        throw new Error(`Failed to get access token: ${data.errmsg}`);
      }

      this.accessToken = data.access_token as string || '';
      this.accessTokenExpireTime = now + (data.expires_in * 1000 - 60000); // Subtract 1 minute to be safe

      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  /**
   * Send message to DingTalk
   */
  async sendMessage(request: SendMessageRequest): Promise<{ errcode: number; errmsg: string }> {
    const accessToken = await this.getAccessToken();

    const params: Record<string, string> = {};
    if (request.userid) params.userid = request.userid;
    if (request.unionid) params.unionid = request.unionid;
    if (request.openConversationId) params.openConversationId = request.openConversationId;
    if (request.conversationId) params.cid = request.conversationId;
    params.agent_id = this.config.agentId;

    const queryString = new URLSearchParams(params).toString();

    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${accessToken}&${queryString}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            msg: request.msg,
          }),
        }
      );

      const data: any = await response.json();

      if (data.errcode !== 0) {
        throw new Error(`Failed to send message: ${data.errmsg}`);
      }

      return { errcode: data.errcode || 0, errmsg: data.errmsg || '' };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send message to user by userid
   */
  async sendToUser(userid: string, msg: DingTalkMessage): Promise<{ errcode: number; errmsg: string }> {
    return this.sendMessage({ userid, msg });
  }

  /**
   * Send message to conversation
   */
  async sendToConversation(conversationId: string, msg: DingTalkMessage): Promise<{ errcode: number; errmsg: string }> {
    return this.sendMessage({ conversationId, msg });
  }
}

export { DingTalkService };
