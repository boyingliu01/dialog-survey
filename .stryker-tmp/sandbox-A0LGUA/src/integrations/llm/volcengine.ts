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
import { error, info } from '../../utils/logger.js';
import { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';
const CHAT_API_PATH = stryMutAct_9fa48('1833')
  ? ''
  : (stryCov_9fa48('1833'), '/v1/chat/completions');

// 支持的模型列表：doubao-seed-2.0-code, doubao-seed-2.0-pro, doubao-seed-2.0-lite,
// doubao-seed-code, minimax-m2.5, glm-4.7, deepseek-v3.2, kimi-k2.5
export const DEFAULT_MODEL = stryMutAct_9fa48('1834')
  ? ''
  : (stryCov_9fa48('1834'), 'deepseek-v3.2');
export class VolcengineLLM implements LLMService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  constructor(options: LLMOptions) {
    if (stryMutAct_9fa48('1835')) {
      {
      }
    } else {
      stryCov_9fa48('1835');
      this.apiKey = options.apiKey;
      this.baseUrl = stryMutAct_9fa48('1838')
        ? options.baseUrl && 'https://ark.cn-beijing.volces.com/api/coding'
        : stryMutAct_9fa48('1837')
          ? false
          : stryMutAct_9fa48('1836')
            ? true
            : (stryCov_9fa48('1836', '1837', '1838'),
              options.baseUrl ||
                (stryMutAct_9fa48('1839')
                  ? ''
                  : (stryCov_9fa48('1839'), 'https://ark.cn-beijing.volces.com/api/coding')));
      this.model = stryMutAct_9fa48('1842')
        ? options.model && DEFAULT_MODEL
        : stryMutAct_9fa48('1841')
          ? false
          : stryMutAct_9fa48('1840')
            ? true
            : (stryCov_9fa48('1840', '1841', '1842'), options.model || DEFAULT_MODEL);
    }
  }
  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (stryMutAct_9fa48('1843')) {
      {
      }
    } else {
      stryCov_9fa48('1843');
      const url = stryMutAct_9fa48('1844')
        ? ``
        : (stryCov_9fa48('1844'), `${this.baseUrl}${CHAT_API_PATH}`);
      info(
        stryMutAct_9fa48('1845') ? '' : (stryCov_9fa48('1845'), 'Volcengine LLM request'),
        stryMutAct_9fa48('1846')
          ? {}
          : (stryCov_9fa48('1846'),
            {
              model: stryMutAct_9fa48('1849')
                ? request.model && this.model
                : stryMutAct_9fa48('1848')
                  ? false
                  : stryMutAct_9fa48('1847')
                    ? true
                    : (stryCov_9fa48('1847', '1848', '1849'), request.model || this.model),
              messageCount: request.messages.length,
            })
      );
      const response = await fetch(
        url,
        stryMutAct_9fa48('1850')
          ? {}
          : (stryCov_9fa48('1850'),
            {
              method: stryMutAct_9fa48('1851') ? '' : (stryCov_9fa48('1851'), 'POST'),
              headers: stryMutAct_9fa48('1852')
                ? {}
                : (stryCov_9fa48('1852'),
                  {
                    Authorization: stryMutAct_9fa48('1853')
                      ? ``
                      : (stryCov_9fa48('1853'), `Bearer ${this.apiKey}`),
                    'Content-Type': stryMutAct_9fa48('1854')
                      ? ''
                      : (stryCov_9fa48('1854'), 'application/json'),
                  }),
              body: JSON.stringify(
                stryMutAct_9fa48('1855')
                  ? {}
                  : (stryCov_9fa48('1855'),
                    {
                      model: stryMutAct_9fa48('1858')
                        ? request.model && this.model
                        : stryMutAct_9fa48('1857')
                          ? false
                          : stryMutAct_9fa48('1856')
                            ? true
                            : (stryCov_9fa48('1856', '1857', '1858'), request.model || this.model),
                      messages: request.messages,
                      temperature: stryMutAct_9fa48('1859')
                        ? request.temperature && 0.7
                        : (stryCov_9fa48('1859'), request.temperature ?? 0.7),
                      max_tokens: stryMutAct_9fa48('1860')
                        ? request.max_tokens && 2000
                        : (stryCov_9fa48('1860'), request.max_tokens ?? 2000),
                    })
              ),
            })
      );
      if (
        stryMutAct_9fa48('1863')
          ? false
          : stryMutAct_9fa48('1862')
            ? true
            : stryMutAct_9fa48('1861')
              ? response.ok
              : (stryCov_9fa48('1861', '1862', '1863'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1864')) {
          {
          }
        } else {
          stryCov_9fa48('1864');
          const errText = await response.text();
          error(
            stryMutAct_9fa48('1865') ? '' : (stryCov_9fa48('1865'), 'Volcengine LLM error'),
            stryMutAct_9fa48('1866')
              ? {}
              : (stryCov_9fa48('1866'),
                {
                  status: response.status,
                  body: errText,
                })
          );
          throw new Error(
            stryMutAct_9fa48('1867')
              ? ``
              : (stryCov_9fa48('1867'), `Volcengine LLM API error: ${response.status} - ${errText}`)
          );
        }
      }
      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
        };
      };
      const choice = stryMutAct_9fa48('1868')
        ? data.choices[0]
        : (stryCov_9fa48('1868'), data.choices?.[0]);
      const content = stryMutAct_9fa48('1871')
        ? choice?.message?.content && ''
        : stryMutAct_9fa48('1870')
          ? false
          : stryMutAct_9fa48('1869')
            ? true
            : (stryCov_9fa48('1869', '1870', '1871'),
              (stryMutAct_9fa48('1873')
                ? choice.message?.content
                : stryMutAct_9fa48('1872')
                  ? choice?.message.content
                  : (stryCov_9fa48('1872', '1873'), choice?.message?.content)) ||
                (stryMutAct_9fa48('1874') ? 'Stryker was here!' : (stryCov_9fa48('1874'), '')));
      const finishReason = stryMutAct_9fa48('1877')
        ? choice?.finish_reason && 'stop'
        : stryMutAct_9fa48('1876')
          ? false
          : stryMutAct_9fa48('1875')
            ? true
            : (stryCov_9fa48('1875', '1876', '1877'),
              (stryMutAct_9fa48('1878')
                ? choice.finish_reason
                : (stryCov_9fa48('1878'), choice?.finish_reason)) ||
                (stryMutAct_9fa48('1879') ? '' : (stryCov_9fa48('1879'), 'stop')));
      info(
        stryMutAct_9fa48('1880') ? '' : (stryCov_9fa48('1880'), 'Volcengine LLM response'),
        stryMutAct_9fa48('1881')
          ? {}
          : (stryCov_9fa48('1881'),
            {
              contentLength: content.length,
              finishReason,
              usage: data.usage,
            })
      );
      return stryMutAct_9fa48('1882')
        ? {}
        : (stryCov_9fa48('1882'),
          {
            content,
            finishReason,
            usage: stryMutAct_9fa48('1883')
              ? {}
              : (stryCov_9fa48('1883'),
                {
                  promptTokens: stryMutAct_9fa48('1886')
                    ? data.usage?.prompt_tokens && 0
                    : stryMutAct_9fa48('1885')
                      ? false
                      : stryMutAct_9fa48('1884')
                        ? true
                        : (stryCov_9fa48('1884', '1885', '1886'),
                          (stryMutAct_9fa48('1887')
                            ? data.usage.prompt_tokens
                            : (stryCov_9fa48('1887'), data.usage?.prompt_tokens)) || 0),
                  completionTokens: stryMutAct_9fa48('1890')
                    ? data.usage?.completion_tokens && 0
                    : stryMutAct_9fa48('1889')
                      ? false
                      : stryMutAct_9fa48('1888')
                        ? true
                        : (stryCov_9fa48('1888', '1889', '1890'),
                          (stryMutAct_9fa48('1891')
                            ? data.usage.completion_tokens
                            : (stryCov_9fa48('1891'), data.usage?.completion_tokens)) || 0),
                }),
          });
    }
  }
  async embeddings(_text: string): Promise<number[]> {
    if (stryMutAct_9fa48('1892')) {
      {
      }
    } else {
      stryCov_9fa48('1892');
      error(
        stryMutAct_9fa48('1893')
          ? ''
          : (stryCov_9fa48('1893'), 'Volcengine embeddings not implemented yet')
      );
      throw new Error(
        stryMutAct_9fa48('1894')
          ? ''
          : (stryCov_9fa48('1894'), 'Embeddings API not implemented for Volcengine')
      );
    }
  }
  static fromEnv(): VolcengineLLM {
    if (stryMutAct_9fa48('1895')) {
      {
      }
    } else {
      stryCov_9fa48('1895');
      const apiKey = stryMutAct_9fa48('1898')
        ? (process.env.VOLCENGINE_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && ''
        : stryMutAct_9fa48('1897')
          ? false
          : stryMutAct_9fa48('1896')
            ? true
            : (stryCov_9fa48('1896', '1897', '1898'),
              (stryMutAct_9fa48('1900')
                ? process.env.VOLCENGINE_API_KEY && process.env.ANTHROPIC_AUTH_TOKEN
                : stryMutAct_9fa48('1899')
                  ? false
                  : (stryCov_9fa48('1899', '1900'),
                    process.env.VOLCENGINE_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) ||
                (stryMutAct_9fa48('1901') ? 'Stryker was here!' : (stryCov_9fa48('1901'), '')));
      const baseUrl = stryMutAct_9fa48('1904')
        ? process.env.VOLCENGINE_BASE_URL && 'https://ark.cn-beijing.volces.com/api/coding'
        : stryMutAct_9fa48('1903')
          ? false
          : stryMutAct_9fa48('1902')
            ? true
            : (stryCov_9fa48('1902', '1903', '1904'),
              process.env.VOLCENGINE_BASE_URL ||
                (stryMutAct_9fa48('1905')
                  ? ''
                  : (stryCov_9fa48('1905'), 'https://ark.cn-beijing.volces.com/api/coding')));
      const model = stryMutAct_9fa48('1908')
        ? process.env.VOLCENGINE_MODEL && DEFAULT_MODEL
        : stryMutAct_9fa48('1907')
          ? false
          : stryMutAct_9fa48('1906')
            ? true
            : (stryCov_9fa48('1906', '1907', '1908'),
              process.env.VOLCENGINE_MODEL || DEFAULT_MODEL);
      if (
        stryMutAct_9fa48('1911')
          ? false
          : stryMutAct_9fa48('1910')
            ? true
            : stryMutAct_9fa48('1909')
              ? apiKey
              : (stryCov_9fa48('1909', '1910', '1911'), !apiKey)
      ) {
        if (stryMutAct_9fa48('1912')) {
          {
          }
        } else {
          stryCov_9fa48('1912');
          throw new Error(
            stryMutAct_9fa48('1913')
              ? ''
              : (stryCov_9fa48('1913'), 'VOLCENGINE_API_KEY or ANTHROPIC_AUTH_TOKEN not configured')
          );
        }
      }
      return new VolcengineLLM(
        stryMutAct_9fa48('1914')
          ? {}
          : (stryCov_9fa48('1914'),
            {
              apiKey,
              baseUrl,
              model,
            })
      );
    }
  }
}
