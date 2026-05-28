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
import { warn } from '../utils/logger.js';
interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}
interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillInterval: number;
  private lastRefill: number;
  private queue: QueuedRequest[] = stryMutAct_9fa48('930')
    ? ['Stryker was here']
    : (stryCov_9fa48('930'), []);
  private processing = stryMutAct_9fa48('931') ? true : (stryCov_9fa48('931'), false);
  constructor(options: RateLimiterOptions) {
    if (stryMutAct_9fa48('932')) {
      {
      }
    } else {
      stryCov_9fa48('932');
      this.maxTokens = options.maxRequests;
      this.tokens = options.maxRequests;
      this.refillInterval = options.windowMs;
      this.lastRefill = Date.now();
    }
  }
  private refill(): void {
    if (stryMutAct_9fa48('933')) {
      {
      }
    } else {
      stryCov_9fa48('933');
      const now = Date.now();
      const elapsed = stryMutAct_9fa48('934')
        ? now + this.lastRefill
        : (stryCov_9fa48('934'), now - this.lastRefill);
      const tokensToAdd = stryMutAct_9fa48('935')
        ? Math.floor(elapsed / this.refillInterval) / this.maxTokens
        : (stryCov_9fa48('935'),
          Math.floor(
            stryMutAct_9fa48('936')
              ? elapsed * this.refillInterval
              : (stryCov_9fa48('936'), elapsed / this.refillInterval)
          ) * this.maxTokens);
      if (
        stryMutAct_9fa48('940')
          ? tokensToAdd <= 0
          : stryMutAct_9fa48('939')
            ? tokensToAdd >= 0
            : stryMutAct_9fa48('938')
              ? false
              : stryMutAct_9fa48('937')
                ? true
                : (stryCov_9fa48('937', '938', '939', '940'), tokensToAdd > 0)
      ) {
        if (stryMutAct_9fa48('941')) {
          {
          }
        } else {
          stryCov_9fa48('941');
          this.tokens = stryMutAct_9fa48('942')
            ? Math.max(this.maxTokens, this.tokens + tokensToAdd)
            : (stryCov_9fa48('942'),
              Math.min(
                this.maxTokens,
                stryMutAct_9fa48('943')
                  ? this.tokens - tokensToAdd
                  : (stryCov_9fa48('943'), this.tokens + tokensToAdd)
              ));
          this.lastRefill = now;
        }
      }
    }
  }
  async acquire(): Promise<void> {
    if (stryMutAct_9fa48('944')) {
      {
      }
    } else {
      stryCov_9fa48('944');
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48('945')) {
          {
          }
        } else {
          stryCov_9fa48('945');
          this.refill();
          if (
            stryMutAct_9fa48('949')
              ? this.tokens < 1
              : stryMutAct_9fa48('948')
                ? this.tokens > 1
                : stryMutAct_9fa48('947')
                  ? false
                  : stryMutAct_9fa48('946')
                    ? true
                    : (stryCov_9fa48('946', '947', '948', '949'), this.tokens >= 1)
          ) {
            if (stryMutAct_9fa48('950')) {
              {
              }
            } else {
              stryCov_9fa48('950');
              stryMutAct_9fa48('951') ? this.tokens++ : (stryCov_9fa48('951'), this.tokens--);
              resolve();
              return;
            }
          }
          this.queue.push(
            stryMutAct_9fa48('952')
              ? {}
              : (stryCov_9fa48('952'),
                {
                  resolve,
                  reject,
                  timestamp: Date.now(),
                })
          );
          this.scheduleProcessing();
        }
      });
    }
  }
  private scheduleProcessing(): void {
    if (stryMutAct_9fa48('953')) {
      {
      }
    } else {
      stryCov_9fa48('953');
      if (
        stryMutAct_9fa48('955')
          ? false
          : stryMutAct_9fa48('954')
            ? true
            : (stryCov_9fa48('954', '955'), this.processing)
      )
        return;
      this.processing = stryMutAct_9fa48('956') ? false : (stryCov_9fa48('956'), true);
      const processQueue = () => {
        if (stryMutAct_9fa48('957')) {
          {
          }
        } else {
          stryCov_9fa48('957');
          this.refill();
          while (
            stryMutAct_9fa48('959')
              ? this.queue.length > 0 || this.tokens >= 1
              : stryMutAct_9fa48('958')
                ? false
                : (stryCov_9fa48('958', '959'),
                  (stryMutAct_9fa48('962')
                    ? this.queue.length <= 0
                    : stryMutAct_9fa48('961')
                      ? this.queue.length >= 0
                      : stryMutAct_9fa48('960')
                        ? true
                        : (stryCov_9fa48('960', '961', '962'), this.queue.length > 0)) &&
                    (stryMutAct_9fa48('965')
                      ? this.tokens < 1
                      : stryMutAct_9fa48('964')
                        ? this.tokens > 1
                        : stryMutAct_9fa48('963')
                          ? true
                          : (stryCov_9fa48('963', '964', '965'), this.tokens >= 1)))
          ) {
            if (stryMutAct_9fa48('966')) {
              {
              }
            } else {
              stryCov_9fa48('966');
              stryMutAct_9fa48('967') ? this.tokens++ : (stryCov_9fa48('967'), this.tokens--);
              const request = this.queue.shift();
              stryMutAct_9fa48('968')
                ? request.resolve()
                : (stryCov_9fa48('968'), request?.resolve());
            }
          }
          if (
            stryMutAct_9fa48('972')
              ? this.queue.length <= 0
              : stryMutAct_9fa48('971')
                ? this.queue.length >= 0
                : stryMutAct_9fa48('970')
                  ? false
                  : stryMutAct_9fa48('969')
                    ? true
                    : (stryCov_9fa48('969', '970', '971', '972'), this.queue.length > 0)
          ) {
            if (stryMutAct_9fa48('973')) {
              {
              }
            } else {
              stryCov_9fa48('973');
              setTimeout(processQueue, 100);
            }
          } else {
            if (stryMutAct_9fa48('974')) {
              {
              }
            } else {
              stryCov_9fa48('974');
              this.processing = stryMutAct_9fa48('975') ? true : (stryCov_9fa48('975'), false);
            }
          }
        }
      };
      processQueue();
    }
  }
  getQueueLength(): number {
    if (stryMutAct_9fa48('976')) {
      {
      }
    } else {
      stryCov_9fa48('976');
      return this.queue.length;
    }
  }
  isOverLimit(): boolean {
    if (stryMutAct_9fa48('977')) {
      {
      }
    } else {
      stryCov_9fa48('977');
      return stryMutAct_9fa48('981')
        ? this.queue.length <= 1000
        : stryMutAct_9fa48('980')
          ? this.queue.length >= 1000
          : stryMutAct_9fa48('979')
            ? false
            : stryMutAct_9fa48('978')
              ? true
              : (stryCov_9fa48('978', '979', '980', '981'), this.queue.length > 1000);
    }
  }
}
export function createRateLimiter(maxRequestsPerSecond = 10): RateLimiter {
  if (stryMutAct_9fa48('982')) {
    {
    }
  } else {
    stryCov_9fa48('982');
    return new RateLimiter(
      stryMutAct_9fa48('983')
        ? {}
        : (stryCov_9fa48('983'),
          {
            maxRequests: maxRequestsPerSecond,
            windowMs: 1000,
          })
    );
  }
}
export const llmRateLimiter = createRateLimiter(10);
export async function withRateLimit<T>(limiter: RateLimiter, fn: () => Promise<T>): Promise<T> {
  if (stryMutAct_9fa48('984')) {
    {
    }
  } else {
    stryCov_9fa48('984');
    if (
      stryMutAct_9fa48('986')
        ? false
        : stryMutAct_9fa48('985')
          ? true
          : (stryCov_9fa48('985', '986'), limiter.isOverLimit())
    ) {
      if (stryMutAct_9fa48('987')) {
        {
        }
      } else {
        stryCov_9fa48('987');
        warn(
          stryMutAct_9fa48('988') ? '' : (stryCov_9fa48('988'), 'Rate limit queue full'),
          stryMutAct_9fa48('989')
            ? {}
            : (stryCov_9fa48('989'),
              {
                queueLength: limiter.getQueueLength(),
              })
        );
        throw new Error(
          stryMutAct_9fa48('990') ? '' : (stryCov_9fa48('990'), '429 Too Many Requests')
        );
      }
    }
    await limiter.acquire();
    return fn();
  }
}
