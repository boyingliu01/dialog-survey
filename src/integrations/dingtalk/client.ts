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

interface AccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
  expires_in: number;
}

interface GetUserByMobileResponse {
  errcode: number;
  errmsg: string;
  userid?: string;
  name?: string;
}

export type DingTalkUserLookupResult =
  | { found: true; userId: string; name: string }
  | { found: false };

export class DingTalkClient {
  private appKey: string;
  private appSecret: string;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: DingTalkClientOptions) {
    this.appKey = options.appKey;
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

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const response = await this.request<AccessTokenResponse>('/gettoken', {
      query: {
        appkey: this.appKey,
        appsecret: this.appSecret,
      },
    });

    if (response.errcode !== 0) {
      throw new Error(
        `DingTalk gettoken failed: ${response.errmsg} (errcode: ${response.errcode})`
      );
    }

    this.cachedToken = response.access_token;
    this.tokenExpiresAt = now + response.expires_in * 1000 - 60000;
    return this.cachedToken;
  }

  async getUserIdByMobile(mobile: string): Promise<DingTalkUserLookupResult> {
    const accessToken = await this.getAccessToken();
    const response = await this.request<GetUserByMobileResponse>('/contact/user/get_by_mobile', {
      query: {
        access_token: accessToken,
        mobile,
      },
    });

    if (response.errcode === 60121) {
      return { found: false };
    }

    if (response.errcode !== 0) {
      throw new Error(
        `DingTalk get_by_mobile failed: ${response.errmsg} (errcode: ${response.errcode})`
      );
    }

    if (!response.userid) {
      return { found: false };
    }

    return {
      found: true,
      userId: response.userid,
      name: response.name || '',
    };
  }

  static fromEnv() {
    return new DingTalkClient({
      appKey: process.env.DINGTALK_APP_KEY || '',
      appSecret: process.env.DINGTALK_APP_SECRET || '',
      agentId: process.env.DINGTALK_AGENT_ID,
    });
  }
}
