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
import { LLMOptions, LLMRequest, LLMResponse, LLMService } from './base.js';
const CHAT_API_URL = stryMutAct_9fa48('1765')
  ? ''
  : (stryCov_9fa48('1765'),
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');
const EMBEDDINGS_URL = stryMutAct_9fa48('1766')
  ? ''
  : (stryCov_9fa48('1766'),
    'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding');
export class AlibabaLLM implements LLMService {
  private apiKey: string;
  private model: string;
  constructor(options: LLMOptions) {
    if (stryMutAct_9fa48('1767')) {
      {
      }
    } else {
      stryCov_9fa48('1767');
      this.apiKey = options.apiKey;
      this.model = stryMutAct_9fa48('1770')
        ? options.model && 'qwen-turbo'
        : stryMutAct_9fa48('1769')
          ? false
          : stryMutAct_9fa48('1768')
            ? true
            : (stryCov_9fa48('1768', '1769', '1770'),
              options.model ||
                (stryMutAct_9fa48('1771') ? '' : (stryCov_9fa48('1771'), 'qwen-turbo')));
    }
  }
  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (stryMutAct_9fa48('1772')) {
      {
      }
    } else {
      stryCov_9fa48('1772');
      const response = await fetch(
        CHAT_API_URL,
        stryMutAct_9fa48('1773')
          ? {}
          : (stryCov_9fa48('1773'),
            {
              method: stryMutAct_9fa48('1774') ? '' : (stryCov_9fa48('1774'), 'POST'),
              headers: stryMutAct_9fa48('1775')
                ? {}
                : (stryCov_9fa48('1775'),
                  {
                    Authorization: stryMutAct_9fa48('1776')
                      ? ``
                      : (stryCov_9fa48('1776'), `Bearer ${this.apiKey}`),
                    'Content-Type': stryMutAct_9fa48('1777')
                      ? ''
                      : (stryCov_9fa48('1777'), 'application/json'),
                  }),
              body: JSON.stringify(
                stryMutAct_9fa48('1778')
                  ? {}
                  : (stryCov_9fa48('1778'),
                    {
                      model: stryMutAct_9fa48('1781')
                        ? request.model && this.model
                        : stryMutAct_9fa48('1780')
                          ? false
                          : stryMutAct_9fa48('1779')
                            ? true
                            : (stryCov_9fa48('1779', '1780', '1781'), request.model || this.model),
                      input: stryMutAct_9fa48('1782')
                        ? {}
                        : (stryCov_9fa48('1782'),
                          {
                            messages: request.messages,
                          }),
                      parameters: stryMutAct_9fa48('1783')
                        ? {}
                        : (stryCov_9fa48('1783'),
                          {
                            temperature: stryMutAct_9fa48('1786')
                              ? request.temperature && 0.7
                              : stryMutAct_9fa48('1785')
                                ? false
                                : stryMutAct_9fa48('1784')
                                  ? true
                                  : (stryCov_9fa48('1784', '1785', '1786'),
                                    request.temperature || 0.7),
                            max_tokens: stryMutAct_9fa48('1789')
                              ? request.max_tokens && 2000
                              : stryMutAct_9fa48('1788')
                                ? false
                                : stryMutAct_9fa48('1787')
                                  ? true
                                  : (stryCov_9fa48('1787', '1788', '1789'),
                                    request.max_tokens || 2000),
                          }),
                    })
              ),
            })
      );
      if (
        stryMutAct_9fa48('1792')
          ? false
          : stryMutAct_9fa48('1791')
            ? true
            : stryMutAct_9fa48('1790')
              ? response.ok
              : (stryCov_9fa48('1790', '1791', '1792'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1793')) {
          {
          }
        } else {
          stryCov_9fa48('1793');
          throw new Error(
            stryMutAct_9fa48('1794')
              ? ``
              : (stryCov_9fa48('1794'), `LLM API error: ${response.status}`)
          );
        }
      }
      const data = (await response.json()) as {
        output?: {
          text?: string;
          finish_reason?: string;
        };
      };
      return stryMutAct_9fa48('1795')
        ? {}
        : (stryCov_9fa48('1795'),
          {
            content: stryMutAct_9fa48('1798')
              ? data.output?.text && ''
              : stryMutAct_9fa48('1797')
                ? false
                : stryMutAct_9fa48('1796')
                  ? true
                  : (stryCov_9fa48('1796', '1797', '1798'),
                    (stryMutAct_9fa48('1799')
                      ? data.output.text
                      : (stryCov_9fa48('1799'), data.output?.text)) ||
                      (stryMutAct_9fa48('1800')
                        ? 'Stryker was here!'
                        : (stryCov_9fa48('1800'), ''))),
            finishReason: stryMutAct_9fa48('1803')
              ? data.output?.finish_reason && 'stop'
              : stryMutAct_9fa48('1802')
                ? false
                : stryMutAct_9fa48('1801')
                  ? true
                  : (stryCov_9fa48('1801', '1802', '1803'),
                    (stryMutAct_9fa48('1804')
                      ? data.output.finish_reason
                      : (stryCov_9fa48('1804'), data.output?.finish_reason)) ||
                      (stryMutAct_9fa48('1805') ? '' : (stryCov_9fa48('1805'), 'stop'))),
          });
    }
  }
  async embeddings(text: string): Promise<number[]> {
    if (stryMutAct_9fa48('1806')) {
      {
      }
    } else {
      stryCov_9fa48('1806');
      const response = await fetch(
        EMBEDDINGS_URL,
        stryMutAct_9fa48('1807')
          ? {}
          : (stryCov_9fa48('1807'),
            {
              method: stryMutAct_9fa48('1808') ? '' : (stryCov_9fa48('1808'), 'POST'),
              headers: stryMutAct_9fa48('1809')
                ? {}
                : (stryCov_9fa48('1809'),
                  {
                    Authorization: stryMutAct_9fa48('1810')
                      ? ``
                      : (stryCov_9fa48('1810'), `Bearer ${this.apiKey}`),
                    'Content-Type': stryMutAct_9fa48('1811')
                      ? ''
                      : (stryCov_9fa48('1811'), 'application/json'),
                  }),
              body: JSON.stringify(
                stryMutAct_9fa48('1812')
                  ? {}
                  : (stryCov_9fa48('1812'),
                    {
                      model: stryMutAct_9fa48('1813')
                        ? ''
                        : (stryCov_9fa48('1813'), 'text-embedding-v3'),
                      input: text,
                    })
              ),
            })
      );
      if (
        stryMutAct_9fa48('1816')
          ? false
          : stryMutAct_9fa48('1815')
            ? true
            : stryMutAct_9fa48('1814')
              ? response.ok
              : (stryCov_9fa48('1814', '1815', '1816'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1817')) {
          {
          }
        } else {
          stryCov_9fa48('1817');
          throw new Error(
            stryMutAct_9fa48('1818')
              ? ``
              : (stryCov_9fa48('1818'), `Embeddings API error: ${response.status}`)
          );
        }
      }
      const data = (await response.json()) as {
        output?: {
          embeddings?: Array<{
            embedding?: number[];
          }>;
        };
      };
      return stryMutAct_9fa48('1821')
        ? data.output?.embeddings?.[0]?.embedding && []
        : stryMutAct_9fa48('1820')
          ? false
          : stryMutAct_9fa48('1819')
            ? true
            : (stryCov_9fa48('1819', '1820', '1821'),
              (stryMutAct_9fa48('1824')
                ? data.output.embeddings?.[0]?.embedding
                : stryMutAct_9fa48('1823')
                  ? data.output?.embeddings[0]?.embedding
                  : stryMutAct_9fa48('1822')
                    ? data.output?.embeddings?.[0].embedding
                    : (stryCov_9fa48('1822', '1823', '1824'),
                      data.output?.embeddings?.[0]?.embedding)) ||
                (stryMutAct_9fa48('1825') ? ['Stryker was here'] : (stryCov_9fa48('1825'), [])));
    }
  }
  static fromEnv(): AlibabaLLM {
    if (stryMutAct_9fa48('1826')) {
      {
      }
    } else {
      stryCov_9fa48('1826');
      return new AlibabaLLM(
        stryMutAct_9fa48('1827')
          ? {}
          : (stryCov_9fa48('1827'),
            {
              apiKey: stryMutAct_9fa48('1830')
                ? process.env.DASHSCOPE_API_KEY && ''
                : stryMutAct_9fa48('1829')
                  ? false
                  : stryMutAct_9fa48('1828')
                    ? true
                    : (stryCov_9fa48('1828', '1829', '1830'),
                      process.env.DASHSCOPE_API_KEY ||
                        (stryMutAct_9fa48('1831')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('1831'), ''))),
              model: stryMutAct_9fa48('1832') ? '' : (stryCov_9fa48('1832'), 'qwen-turbo'),
            })
      );
    }
  }
}
