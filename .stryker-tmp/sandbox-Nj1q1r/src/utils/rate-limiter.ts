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
  private queue: QueuedRequest[] = stryMutAct_9fa48('640')
    ? ['Stryker was here']
    : (stryCov_9fa48('640'), []);
  private processing = stryMutAct_9fa48('641') ? true : (stryCov_9fa48('641'), false);
  constructor(options: RateLimiterOptions) {
    if (stryMutAct_9fa48('642')) {
      {
      }
    } else {
      stryCov_9fa48('642');
      this.maxTokens = options.maxRequests;
      this.tokens = options.maxRequests;
      this.refillInterval = options.windowMs;
      this.lastRefill = Date.now();
    }
  }
  private refill(): void {
    if (stryMutAct_9fa48('643')) {
      {
      }
    } else {
      stryCov_9fa48('643');
      const now = Date.now();
      const elapsed = stryMutAct_9fa48('644')
        ? now + this.lastRefill
        : (stryCov_9fa48('644'), now - this.lastRefill);
      const tokensToAdd = stryMutAct_9fa48('645')
        ? Math.floor(elapsed / this.refillInterval) / this.maxTokens
        : (stryCov_9fa48('645'),
          Math.floor(
            stryMutAct_9fa48('646')
              ? elapsed * this.refillInterval
              : (stryCov_9fa48('646'), elapsed / this.refillInterval)
          ) * this.maxTokens);
      if (
        stryMutAct_9fa48('650')
          ? tokensToAdd <= 0
          : stryMutAct_9fa48('649')
            ? tokensToAdd >= 0
            : stryMutAct_9fa48('648')
              ? false
              : stryMutAct_9fa48('647')
                ? true
                : (stryCov_9fa48('647', '648', '649', '650'), tokensToAdd > 0)
      ) {
        if (stryMutAct_9fa48('651')) {
          {
          }
        } else {
          stryCov_9fa48('651');
          this.tokens = stryMutAct_9fa48('652')
            ? Math.max(this.maxTokens, this.tokens + tokensToAdd)
            : (stryCov_9fa48('652'),
              Math.min(
                this.maxTokens,
                stryMutAct_9fa48('653')
                  ? this.tokens - tokensToAdd
                  : (stryCov_9fa48('653'), this.tokens + tokensToAdd)
              ));
          this.lastRefill = now;
        }
      }
    }
  }
  async acquire(): Promise<void> {
    if (stryMutAct_9fa48('654')) {
      {
      }
    } else {
      stryCov_9fa48('654');
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48('655')) {
          {
          }
        } else {
          stryCov_9fa48('655');
          this.refill();
          if (
            stryMutAct_9fa48('659')
              ? this.tokens < 1
              : stryMutAct_9fa48('658')
                ? this.tokens > 1
                : stryMutAct_9fa48('657')
                  ? false
                  : stryMutAct_9fa48('656')
                    ? true
                    : (stryCov_9fa48('656', '657', '658', '659'), this.tokens >= 1)
          ) {
            if (stryMutAct_9fa48('660')) {
              {
              }
            } else {
              stryCov_9fa48('660');
              stryMutAct_9fa48('661') ? this.tokens++ : (stryCov_9fa48('661'), this.tokens--);
              resolve();
              return;
            }
          }
          this.queue.push(
            stryMutAct_9fa48('662')
              ? {}
              : (stryCov_9fa48('662'),
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
    if (stryMutAct_9fa48('663')) {
      {
      }
    } else {
      stryCov_9fa48('663');
      if (
        stryMutAct_9fa48('665')
          ? false
          : stryMutAct_9fa48('664')
            ? true
            : (stryCov_9fa48('664', '665'), this.processing)
      )
        return;
      this.processing = stryMutAct_9fa48('666') ? false : (stryCov_9fa48('666'), true);
      const processQueue = () => {
        if (stryMutAct_9fa48('667')) {
          {
          }
        } else {
          stryCov_9fa48('667');
          this.refill();
          while (
            stryMutAct_9fa48('669')
              ? this.queue.length > 0 || this.tokens >= 1
              : stryMutAct_9fa48('668')
                ? false
                : (stryCov_9fa48('668', '669'),
                  (stryMutAct_9fa48('672')
                    ? this.queue.length <= 0
                    : stryMutAct_9fa48('671')
                      ? this.queue.length >= 0
                      : stryMutAct_9fa48('670')
                        ? true
                        : (stryCov_9fa48('670', '671', '672'), this.queue.length > 0)) &&
                    (stryMutAct_9fa48('675')
                      ? this.tokens < 1
                      : stryMutAct_9fa48('674')
                        ? this.tokens > 1
                        : stryMutAct_9fa48('673')
                          ? true
                          : (stryCov_9fa48('673', '674', '675'), this.tokens >= 1)))
          ) {
            if (stryMutAct_9fa48('676')) {
              {
              }
            } else {
              stryCov_9fa48('676');
              stryMutAct_9fa48('677') ? this.tokens++ : (stryCov_9fa48('677'), this.tokens--);
              const request = this.queue.shift();
              stryMutAct_9fa48('678')
                ? request.resolve()
                : (stryCov_9fa48('678'), request?.resolve());
            }
          }
          if (
            stryMutAct_9fa48('682')
              ? this.queue.length <= 0
              : stryMutAct_9fa48('681')
                ? this.queue.length >= 0
                : stryMutAct_9fa48('680')
                  ? false
                  : stryMutAct_9fa48('679')
                    ? true
                    : (stryCov_9fa48('679', '680', '681', '682'), this.queue.length > 0)
          ) {
            if (stryMutAct_9fa48('683')) {
              {
              }
            } else {
              stryCov_9fa48('683');
              setTimeout(processQueue, 100);
            }
          } else {
            if (stryMutAct_9fa48('684')) {
              {
              }
            } else {
              stryCov_9fa48('684');
              this.processing = stryMutAct_9fa48('685') ? true : (stryCov_9fa48('685'), false);
            }
          }
        }
      };
      processQueue();
    }
  }
  getQueueLength(): number {
    if (stryMutAct_9fa48('686')) {
      {
      }
    } else {
      stryCov_9fa48('686');
      return this.queue.length;
    }
  }
  isOverLimit(): boolean {
    if (stryMutAct_9fa48('687')) {
      {
      }
    } else {
      stryCov_9fa48('687');
      return stryMutAct_9fa48('691')
        ? this.queue.length <= 1000
        : stryMutAct_9fa48('690')
          ? this.queue.length >= 1000
          : stryMutAct_9fa48('689')
            ? false
            : stryMutAct_9fa48('688')
              ? true
              : (stryCov_9fa48('688', '689', '690', '691'), this.queue.length > 1000);
    }
  }
}
export function createRateLimiter(maxRequestsPerSecond = 10): RateLimiter {
  if (stryMutAct_9fa48('692')) {
    {
    }
  } else {
    stryCov_9fa48('692');
    return new RateLimiter(
      stryMutAct_9fa48('693')
        ? {}
        : (stryCov_9fa48('693'),
          {
            maxRequests: maxRequestsPerSecond,
            windowMs: 1000,
          })
    );
  }
}
export const llmRateLimiter = createRateLimiter(10);
export async function withRateLimit<T>(limiter: RateLimiter, fn: () => Promise<T>): Promise<T> {
  if (stryMutAct_9fa48('694')) {
    {
    }
  } else {
    stryCov_9fa48('694');
    if (
      stryMutAct_9fa48('696')
        ? false
        : stryMutAct_9fa48('695')
          ? true
          : (stryCov_9fa48('695', '696'), limiter.isOverLimit())
    ) {
      if (stryMutAct_9fa48('697')) {
        {
        }
      } else {
        stryCov_9fa48('697');
        warn(
          stryMutAct_9fa48('698') ? '' : (stryCov_9fa48('698'), 'Rate limit queue full'),
          stryMutAct_9fa48('699')
            ? {}
            : (stryCov_9fa48('699'),
              {
                queueLength: limiter.getQueueLength(),
              })
        );
        throw new Error(
          stryMutAct_9fa48('700') ? '' : (stryCov_9fa48('700'), '429 Too Many Requests')
        );
      }
    }
    await limiter.acquire();
    return fn();
  }
}
