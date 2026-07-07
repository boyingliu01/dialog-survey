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
  result?: {
    userid?: string;
    exclusive_account_userid_list?: string[];
  };
}

export type DingTalkUserLookupResult =
  | { found: true; userId: string; name: string }
  | { found: false };

export interface DingTalkUserInfo {
  userid: string;
  name: string | undefined;
  mobile: string | undefined;
  stateCode: string | undefined;
  active: boolean | undefined;
  deptIdList: number[] | undefined;
}

interface GetUserByUserIdResponse {
  errcode: number;
  errmsg: string;
  result?: {
    userid?: string;
    name?: string;
    mobile?: string;
    state_code?: string;
    active?: boolean;
    dept_id_list?: number[];
  };
}

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
    const init: Record<string, unknown> = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (options.body) {
      init['body'] = JSON.stringify(options.body);
    }
    const response = await fetch(url, init as RequestInit);

    if (!response.ok) {
      throw new Error(`DingTalk API error: ${response.status}`);
    }

    const data = (await response.json()) as T;
    return data;
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(`${API_BASE}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.append(key, value);
      }
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
    const response = await this.request<GetUserByMobileResponse>('/topapi/v2/user/getbymobile', {
      method: 'POST',
      body: {
        mobile,
        support_exclusive_account_search: true,
      },
      query: {
        access_token: accessToken,
      },
    });

    if (response.errcode === 60121) {
      return { found: false };
    }

    if (response.errcode !== 0) {
      throw new Error(
        `DingTalk getbymobile failed: ${response.errmsg} (errcode: ${response.errcode})`
      );
    }

    if (!response.result?.userid) {
      return { found: false };
    }

    return {
      found: true,
      userId: response.result.userid,
      name: '',
    };
  }

  async getUserByUserId(userId: string): Promise<DingTalkUserInfo> {
    const accessToken = await this.getAccessToken();
    const response = await this.request<GetUserByUserIdResponse>('/topapi/v2/user/get', {
      method: 'POST',
      body: {
        userid: userId,
        language: 'zh_CN',
      },
      query: {
        access_token: accessToken,
      },
    });

    if (response.errcode !== 0) {
      throw new Error(
        `DingTalk user/get failed: ${response.errmsg} (errcode: ${response.errcode})`
      );
    }

    if (!response.result?.userid) {
      throw new Error('DingTalk user/get returned no userid');
    }

    return {
      userid: response.result.userid,
      name: response.result.name,
      mobile: response.result.mobile,
      stateCode: response.result.state_code,
      active: response.result.active,
      deptIdList: response.result.dept_id_list,
    };
  }

  static fromEnv() {
    const agentId: string | undefined = process.env['DINGTALK_AGENT_ID'];
    return new DingTalkClient({
      appKey: process.env['DINGTALK_APP_KEY'] || '',
      appSecret: process.env['DINGTALK_APP_SECRET'] || '',
      ...(agentId != null ? { agentId } : {}),
    });
  }
}
