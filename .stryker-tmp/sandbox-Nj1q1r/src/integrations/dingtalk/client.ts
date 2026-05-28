// @ts-nocheck
import crypto from 'node:crypto';

const API_BASE = 'https://oapi.dingtalk.com';

interface DingTalkClientOptions {
  appKey: string;
  appSecret: string;
  agentId?: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export class DingTalkClient {
  private appSecret: string;

  constructor(options: DingTalkClientOptions) {
    this.appSecret = options.appSecret;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`DingTalk API error: ${response.status}`);
    }

    const data = (await response.json()) as T;
    return data;
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(`${API_BASE}${path}`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  generateSignature(timestamp: number): string {
    const stringToSign = `${timestamp}\n${this.appSecret}`;
    return crypto.createHmac('sha256', this.appSecret).update(stringToSign).digest('base64');
  }

  static fromEnv() {
    return new DingTalkClient({
      appKey: process.env.DINGTALK_APP_KEY || '',
      appSecret: process.env.DINGTALK_APP_SECRET || '',
      agentId: process.env.DINGTALK_AGENT_ID,
    });
  }
}
