// @ts-nocheck
function stryNS_9fa48() {
  var g =
    (typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis) ||
    new Function('return this')();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (
    ns.activeMutant === undefined &&
    g.process &&
    g.process.env &&
    g.process.env.__STRYKER_ACTIVE_MUTANT__
  ) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov =
    ns.mutantCoverage ||
    (ns.mutantCoverage = {
      static: {},
      perTest: {},
    });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
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
const TOKEN_REFRESH_BUFFER_MS = stryMutAct_9fa48('1671')
  ? (5 * 60) / 1000
  : (stryCov_9fa48('1671'),
    (stryMutAct_9fa48('1672') ? 5 / 60 : (stryCov_9fa48('1672'), 5 * 60)) * 1000);
const TOKEN_MAX_RETRIES = 2;
export class DingTalkTokenManager implements TokenManager {
  private cachedToken: string | null = null;
  private tokenExpiryTime: number | null = null;
  private isRefreshing = stryMutAct_9fa48('1673') ? true : (stryCov_9fa48('1673'), false);
  private refreshPromise: Promise<string> | null = null;
  async getAccessToken(): Promise<string> {
    if (stryMutAct_9fa48('1674')) {
      {
      }
    } else {
      stryCov_9fa48('1674');
      this.validateCredentials();
      const cached = this.getValidCachedToken();
      if (
        stryMutAct_9fa48('1676')
          ? false
          : stryMutAct_9fa48('1675')
            ? true
            : (stryCov_9fa48('1675', '1676'), cached)
      )
        return cached;
      if (
        stryMutAct_9fa48('1679')
          ? this.isRefreshing || this.refreshPromise
          : stryMutAct_9fa48('1678')
            ? false
            : stryMutAct_9fa48('1677')
              ? true
              : (stryCov_9fa48('1677', '1678', '1679'), this.isRefreshing && this.refreshPromise)
      ) {
        if (stryMutAct_9fa48('1680')) {
          {
          }
        } else {
          stryCov_9fa48('1680');
          return this.refreshPromise;
        }
      }
      return this.refreshToken();
    }
  }
  private validateCredentials(): void {
    if (stryMutAct_9fa48('1681')) {
      {
      }
    } else {
      stryCov_9fa48('1681');
      const id = process.env.DINGTALK_CLIENT_ID;
      const secret = process.env.DINGTALK_CLIENT_SECRET;
      if (
        stryMutAct_9fa48('1684')
          ? !id && !secret
          : stryMutAct_9fa48('1683')
            ? false
            : stryMutAct_9fa48('1682')
              ? true
              : (stryCov_9fa48('1682', '1683', '1684'),
                (stryMutAct_9fa48('1685') ? id : (stryCov_9fa48('1685'), !id)) ||
                  (stryMutAct_9fa48('1686') ? secret : (stryCov_9fa48('1686'), !secret)))
      ) {
        if (stryMutAct_9fa48('1687')) {
          {
          }
        } else {
          stryCov_9fa48('1687');
          throw new Error(
            stryMutAct_9fa48('1688')
              ? ''
              : (stryCov_9fa48('1688'),
                'DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET must be set in environment variables')
          );
        }
      }
    }
  }
  private getValidCachedToken(): string | null {
    if (stryMutAct_9fa48('1689')) {
      {
      }
    } else {
      stryCov_9fa48('1689');
      if (
        stryMutAct_9fa48('1692')
          ? !this.cachedToken && !this.tokenExpiryTime
          : stryMutAct_9fa48('1691')
            ? false
            : stryMutAct_9fa48('1690')
              ? true
              : (stryCov_9fa48('1690', '1691', '1692'),
                (stryMutAct_9fa48('1693')
                  ? this.cachedToken
                  : (stryCov_9fa48('1693'), !this.cachedToken)) ||
                  (stryMutAct_9fa48('1694')
                    ? this.tokenExpiryTime
                    : (stryCov_9fa48('1694'), !this.tokenExpiryTime)))
      )
        return null;
      if (
        stryMutAct_9fa48('1698')
          ? Date.now() < this.tokenExpiryTime - TOKEN_REFRESH_BUFFER_MS
          : stryMutAct_9fa48('1697')
            ? Date.now() > this.tokenExpiryTime - TOKEN_REFRESH_BUFFER_MS
            : stryMutAct_9fa48('1696')
              ? false
              : stryMutAct_9fa48('1695')
                ? true
                : (stryCov_9fa48('1695', '1696', '1697', '1698'),
                  Date.now() >=
                    (stryMutAct_9fa48('1699')
                      ? this.tokenExpiryTime + TOKEN_REFRESH_BUFFER_MS
                      : (stryCov_9fa48('1699'), this.tokenExpiryTime - TOKEN_REFRESH_BUFFER_MS)))
      )
        return null;
      return this.cachedToken;
    }
  }
  private async refreshToken(): Promise<string> {
    if (stryMutAct_9fa48('1700')) {
      {
      }
    } else {
      stryCov_9fa48('1700');
      this.isRefreshing = stryMutAct_9fa48('1701') ? false : (stryCov_9fa48('1701'), true);
      try {
        if (stryMutAct_9fa48('1702')) {
          {
          }
        } else {
          stryCov_9fa48('1702');
          this.refreshPromise = this.fetchWithRetry().then((token) => {
            if (stryMutAct_9fa48('1703')) {
              {
              }
            } else {
              stryCov_9fa48('1703');
              this.cachedToken = token.access_token;
              this.tokenExpiryTime = stryMutAct_9fa48('1704')
                ? Date.now() - token.expires_in * 1000
                : (stryCov_9fa48('1704'),
                  Date.now() +
                    (stryMutAct_9fa48('1705')
                      ? token.expires_in / 1000
                      : (stryCov_9fa48('1705'), token.expires_in * 1000)));
              info(
                stryMutAct_9fa48('1706')
                  ? ''
                  : (stryCov_9fa48('1706'), 'Successfully refreshed access token')
              );
              return token.access_token;
            }
          });
          return await this.refreshPromise;
        }
      } catch (err) {
        if (stryMutAct_9fa48('1707')) {
          {
          }
        } else {
          stryCov_9fa48('1707');
          const errMsg = err instanceof Error ? err.message : String(err);
          error(
            stryMutAct_9fa48('1708')
              ? ''
              : (stryCov_9fa48('1708'), 'Failed to refresh access token'),
            stryMutAct_9fa48('1709')
              ? {}
              : (stryCov_9fa48('1709'),
                {
                  error: errMsg,
                })
          );
          throw new Error(
            stryMutAct_9fa48('1710')
              ? ``
              : (stryCov_9fa48('1710'), `Failed to get DingTalk access token: ${errMsg}`)
          );
        }
      } finally {
        if (stryMutAct_9fa48('1711')) {
          {
          }
        } else {
          stryCov_9fa48('1711');
          this.isRefreshing = stryMutAct_9fa48('1712') ? true : (stryCov_9fa48('1712'), false);
          this.refreshPromise = null;
        }
      }
    }
  }
  private async fetchWithRetry(): Promise<TokenResponse> {
    if (stryMutAct_9fa48('1713')) {
      {
      }
    } else {
      stryCov_9fa48('1713');
      let attempt = 0;
      while (
        stryMutAct_9fa48('1715')
          ? false
          : stryMutAct_9fa48('1714')
            ? false
            : (stryCov_9fa48('1714', '1715'), true)
      ) {
        if (stryMutAct_9fa48('1716')) {
          {
          }
        } else {
          stryCov_9fa48('1716');
          const result = await this.tryFetch();
          if (
            stryMutAct_9fa48('1718')
              ? false
              : stryMutAct_9fa48('1717')
                ? true
                : (stryCov_9fa48('1717', '1718'), result.ok)
          )
            return result.token;
          stryMutAct_9fa48('1719') ? attempt-- : (stryCov_9fa48('1719'), attempt++);
          if (
            stryMutAct_9fa48('1723')
              ? attempt <= TOKEN_MAX_RETRIES
              : stryMutAct_9fa48('1722')
                ? attempt >= TOKEN_MAX_RETRIES
                : stryMutAct_9fa48('1721')
                  ? false
                  : stryMutAct_9fa48('1720')
                    ? true
                    : (stryCov_9fa48('1720', '1721', '1722', '1723'), attempt > TOKEN_MAX_RETRIES)
          )
            throw result.error;
          await this.delay(
            stryMutAct_9fa48('1724')
              ? 2 ** attempt / 1000
              : (stryCov_9fa48('1724'), 2 ** attempt * 1000)
          );
        }
      }
    }
  }
  private async tryFetch(): Promise<{
    ok: boolean;
    token: TokenResponse;
    error: Error;
  }> {
    if (stryMutAct_9fa48('1725')) {
      {
      }
    } else {
      stryCov_9fa48('1725');
      try {
        if (stryMutAct_9fa48('1726')) {
          {
          }
        } else {
          stryCov_9fa48('1726');
          const token = await this.doFetch();
          const validationError = this.validateTokenResponse(token);
          if (
            stryMutAct_9fa48('1728')
              ? false
              : stryMutAct_9fa48('1727')
                ? true
                : (stryCov_9fa48('1727', '1728'), validationError)
          )
            return stryMutAct_9fa48('1729')
              ? {}
              : (stryCov_9fa48('1729'),
                {
                  ok: stryMutAct_9fa48('1730') ? true : (stryCov_9fa48('1730'), false),
                  token,
                  error: validationError,
                });
          return stryMutAct_9fa48('1731')
            ? {}
            : (stryCov_9fa48('1731'),
              {
                ok: stryMutAct_9fa48('1732') ? false : (stryCov_9fa48('1732'), true),
                token,
                error: new Error(
                  stryMutAct_9fa48('1733') ? '' : (stryCov_9fa48('1733'), 'unreachable')
                ),
              });
        }
      } catch (err) {
        if (stryMutAct_9fa48('1734')) {
          {
          }
        } else {
          stryCov_9fa48('1734');
          const e = err instanceof Error ? err : new Error(String(err));
          warn(
            stryMutAct_9fa48('1735') ? '' : (stryCov_9fa48('1735'), 'Fetch attempt failed'),
            stryMutAct_9fa48('1736')
              ? {}
              : (stryCov_9fa48('1736'),
                {
                  error: e.message,
                })
          );
          return stryMutAct_9fa48('1737')
            ? {}
            : (stryCov_9fa48('1737'),
              {
                ok: stryMutAct_9fa48('1738') ? true : (stryCov_9fa48('1738'), false),
                token: {} as TokenResponse,
                error: e,
              });
        }
      }
    }
  }
  private validateTokenResponse(token: TokenResponse): Error | null {
    if (stryMutAct_9fa48('1739')) {
      {
      }
    } else {
      stryCov_9fa48('1739');
      if (
        stryMutAct_9fa48('1742')
          ? token.errcode === 0
          : stryMutAct_9fa48('1741')
            ? false
            : stryMutAct_9fa48('1740')
              ? true
              : (stryCov_9fa48('1740', '1741', '1742'), token.errcode !== 0)
      ) {
        if (stryMutAct_9fa48('1743')) {
          {
          }
        } else {
          stryCov_9fa48('1743');
          return new Error(
            stryMutAct_9fa48('1744')
              ? ``
              : (stryCov_9fa48('1744'),
                `DingTalk API error: ${token.errmsg} (code: ${token.errcode})`)
          );
        }
      }
      if (
        stryMutAct_9fa48('1747')
          ? false
          : stryMutAct_9fa48('1746')
            ? true
            : stryMutAct_9fa48('1745')
              ? token.access_token
              : (stryCov_9fa48('1745', '1746', '1747'), !token.access_token)
      ) {
        if (stryMutAct_9fa48('1748')) {
          {
          }
        } else {
          stryCov_9fa48('1748');
          return new Error(
            stryMutAct_9fa48('1749')
              ? ''
              : (stryCov_9fa48('1749'), 'Access token not found in response')
          );
        }
      }
      return null;
    }
  }
  private async doFetch(): Promise<TokenResponse> {
    if (stryMutAct_9fa48('1750')) {
      {
      }
    } else {
      stryCov_9fa48('1750');
      const id = stryMutAct_9fa48('1751')
        ? process.env.DINGTALK_CLIENT_ID && ''
        : (stryCov_9fa48('1751'),
          process.env.DINGTALK_CLIENT_ID ??
            (stryMutAct_9fa48('1752') ? 'Stryker was here!' : (stryCov_9fa48('1752'), '')));
      const secret = stryMutAct_9fa48('1753')
        ? process.env.DINGTALK_CLIENT_SECRET && ''
        : (stryCov_9fa48('1753'),
          process.env.DINGTALK_CLIENT_SECRET ??
            (stryMutAct_9fa48('1754') ? 'Stryker was here!' : (stryCov_9fa48('1754'), '')));
      const url = stryMutAct_9fa48('1755')
        ? ``
        : (stryCov_9fa48('1755'),
          `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(id)}&appsecret=${encodeURIComponent(secret)}`);
      const response = await fetch(url);
      if (
        stryMutAct_9fa48('1758')
          ? false
          : stryMutAct_9fa48('1757')
            ? true
            : stryMutAct_9fa48('1756')
              ? response.ok
              : (stryCov_9fa48('1756', '1757', '1758'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1759')) {
          {
          }
        } else {
          stryCov_9fa48('1759');
          throw new Error(
            stryMutAct_9fa48('1760')
              ? ``
              : (stryCov_9fa48('1760'), `HTTP ${response.status}: ${response.statusText}`)
          );
        }
      }
      return (await response.json()) as TokenResponse;
    }
  }
  private delay(ms: number): Promise<void> {
    if (stryMutAct_9fa48('1761')) {
      {
      }
    } else {
      stryCov_9fa48('1761');
      return new Promise(
        stryMutAct_9fa48('1762')
          ? () => undefined
          : (stryCov_9fa48('1762'), (resolve) => setTimeout(resolve, ms))
      );
    }
  }
  invalidateToken(): void {
    if (stryMutAct_9fa48('1763')) {
      {
      }
    } else {
      stryCov_9fa48('1763');
      info(
        stryMutAct_9fa48('1764') ? '' : (stryCov_9fa48('1764'), 'Invalidating cached access token')
      );
      this.cachedToken = null;
      this.tokenExpiryTime = null;
    }
  }
}
export const tokenManager = new DingTalkTokenManager();
