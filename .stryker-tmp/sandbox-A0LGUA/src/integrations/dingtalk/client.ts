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
import crypto from 'node:crypto';
const API_BASE = stryMutAct_9fa48('1328')
  ? ''
  : (stryCov_9fa48('1328'), 'https://oapi.dingtalk.com');
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
    if (stryMutAct_9fa48('1329')) {
      {
      }
    } else {
      stryCov_9fa48('1329');
      this.appSecret = options.appSecret;
    }
  }
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (stryMutAct_9fa48('1330')) {
      {
      }
    } else {
      stryCov_9fa48('1330');
      const url = this.buildUrl(path, options.query);
      const response = await fetch(
        url,
        stryMutAct_9fa48('1331')
          ? {}
          : (stryCov_9fa48('1331'),
            {
              method: stryMutAct_9fa48('1334')
                ? options.method && 'GET'
                : stryMutAct_9fa48('1333')
                  ? false
                  : stryMutAct_9fa48('1332')
                    ? true
                    : (stryCov_9fa48('1332', '1333', '1334'),
                      options.method ||
                        (stryMutAct_9fa48('1335') ? '' : (stryCov_9fa48('1335'), 'GET'))),
              headers: stryMutAct_9fa48('1336')
                ? {}
                : (stryCov_9fa48('1336'),
                  {
                    'Content-Type': stryMutAct_9fa48('1337')
                      ? ''
                      : (stryCov_9fa48('1337'), 'application/json'),
                  }),
              body: options.body ? JSON.stringify(options.body) : undefined,
            })
      );
      if (
        stryMutAct_9fa48('1340')
          ? false
          : stryMutAct_9fa48('1339')
            ? true
            : stryMutAct_9fa48('1338')
              ? response.ok
              : (stryCov_9fa48('1338', '1339', '1340'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1341')) {
          {
          }
        } else {
          stryCov_9fa48('1341');
          throw new Error(
            stryMutAct_9fa48('1342')
              ? ``
              : (stryCov_9fa48('1342'), `DingTalk API error: ${response.status}`)
          );
        }
      }
      const data = (await response.json()) as T;
      return data;
    }
  }
  private buildUrl(path: string, query?: Record<string, string>): string {
    if (stryMutAct_9fa48('1343')) {
      {
      }
    } else {
      stryCov_9fa48('1343');
      const url = new URL(
        stryMutAct_9fa48('1344') ? `` : (stryCov_9fa48('1344'), `${API_BASE}${path}`)
      );
      if (
        stryMutAct_9fa48('1346')
          ? false
          : stryMutAct_9fa48('1345')
            ? true
            : (stryCov_9fa48('1345', '1346'), query)
      ) {
        if (stryMutAct_9fa48('1347')) {
          {
          }
        } else {
          stryCov_9fa48('1347');
          Object.entries(query).forEach(([key, value]) => {
            if (stryMutAct_9fa48('1348')) {
              {
              }
            } else {
              stryCov_9fa48('1348');
              url.searchParams.append(key, value);
            }
          });
        }
      }
      return url.toString();
    }
  }
  generateSignature(timestamp: number): string {
    if (stryMutAct_9fa48('1349')) {
      {
      }
    } else {
      stryCov_9fa48('1349');
      const stringToSign = stryMutAct_9fa48('1350')
        ? ``
        : (stryCov_9fa48('1350'), `${timestamp}\n${this.appSecret}`);
      return crypto
        .createHmac(
          stryMutAct_9fa48('1351') ? '' : (stryCov_9fa48('1351'), 'sha256'),
          this.appSecret
        )
        .update(stringToSign)
        .digest(stryMutAct_9fa48('1352') ? '' : (stryCov_9fa48('1352'), 'base64'));
    }
  }
  static fromEnv() {
    if (stryMutAct_9fa48('1353')) {
      {
      }
    } else {
      stryCov_9fa48('1353');
      return new DingTalkClient(
        stryMutAct_9fa48('1354')
          ? {}
          : (stryCov_9fa48('1354'),
            {
              appKey: stryMutAct_9fa48('1357')
                ? process.env.DINGTALK_APP_KEY && ''
                : stryMutAct_9fa48('1356')
                  ? false
                  : stryMutAct_9fa48('1355')
                    ? true
                    : (stryCov_9fa48('1355', '1356', '1357'),
                      process.env.DINGTALK_APP_KEY ||
                        (stryMutAct_9fa48('1358')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('1358'), ''))),
              appSecret: stryMutAct_9fa48('1361')
                ? process.env.DINGTALK_APP_SECRET && ''
                : stryMutAct_9fa48('1360')
                  ? false
                  : stryMutAct_9fa48('1359')
                    ? true
                    : (stryCov_9fa48('1359', '1360', '1361'),
                      process.env.DINGTALK_APP_SECRET ||
                        (stryMutAct_9fa48('1362')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('1362'), ''))),
              agentId: process.env.DINGTALK_AGENT_ID,
            })
      );
    }
  }
}
