import { error, info, warn } from '../../utils/logger.js';

interface TokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
  expires_in: number;
}

export interface TokenManager {
  getAccessToken(): Promise<string>;
  invalidateToken(): void;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_MAX_RETRIES = 2;

export class DingTalkTokenManager implements TokenManager {
  private cachedToken: string | null = null;
  private tokenExpiryTime: number | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    this.validateCredentials();
    const cached = this.getValidCachedToken();
    if (cached) return cached;
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }
    return this.refreshToken();
  }

  private validateCredentials(): void {
    const id = process.env.DINGTALK_CLIENT_ID;
    const secret = process.env.DINGTALK_CLIENT_SECRET;
    if (!id || !secret) {
      throw new Error(
        'DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET must be set in environment variables'
      );
    }
  }

  private getValidCachedToken(): string | null {
    if (!this.cachedToken || !this.tokenExpiryTime) return null;
    if (Date.now() >= this.tokenExpiryTime - TOKEN_REFRESH_BUFFER_MS) return null;
    return this.cachedToken;
  }

  private async refreshToken(): Promise<string> {
    this.isRefreshing = true;
    try {
      this.refreshPromise = this.fetchWithRetry().then((token) => {
        this.cachedToken = token.access_token;
        this.tokenExpiryTime = Date.now() + token.expires_in * 1000;
        info('Successfully refreshed access token');
        return token.access_token;
      });
      return await this.refreshPromise;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      error('Failed to refresh access token', { error: errMsg });
      throw new Error(`Failed to get DingTalk access token: ${errMsg}`);
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async fetchWithRetry(): Promise<TokenResponse> {
    let attempt = 0;
    while (true) {
      const result = await this.tryFetch();
      if (result.ok) return result.token;
      attempt++;
      if (attempt > TOKEN_MAX_RETRIES) throw result.error;
      await this.delay(2 ** attempt * 1000);
    }
  }

  private async tryFetch(): Promise<{
    ok: boolean;
    token: TokenResponse;
    error: Error;
  }> {
    try {
      const token = await this.doFetch();
      const validationError = this.validateTokenResponse(token);
      if (validationError) return { ok: false, token, error: validationError };
      return { ok: true, token, error: new Error('unreachable') };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      warn('Fetch attempt failed', { error: e.message });
      return { ok: false, token: {} as TokenResponse, error: e };
    }
  }

  private validateTokenResponse(token: TokenResponse): Error | null {
    if (token.errcode !== 0) {
      return new Error(`DingTalk API error: ${token.errmsg} (code: ${token.errcode})`);
    }
    if (!token.access_token) {
      return new Error('Access token not found in response');
    }
    return null;
  }

  private async doFetch(): Promise<TokenResponse> {
    const id = process.env.DINGTALK_CLIENT_ID ?? '';
    const secret = process.env.DINGTALK_CLIENT_SECRET ?? '';
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(id)}&appsecret=${encodeURIComponent(secret)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as TokenResponse;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  invalidateToken(): void {
    info('Invalidating cached access token');
    this.cachedToken = null;
    this.tokenExpiryTime = null;
  }
}

export const tokenManager = new DingTalkTokenManager();
