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
  private queue: QueuedRequest[] = stryMutAct_9fa48('4051')
    ? ['Stryker was here']
    : (stryCov_9fa48('4051'), []);
  private processing = stryMutAct_9fa48('4052') ? true : (stryCov_9fa48('4052'), false);
  constructor(options: RateLimiterOptions) {
    if (stryMutAct_9fa48('4053')) {
      {
      }
    } else {
      stryCov_9fa48('4053');
      this.maxTokens = options.maxRequests;
      this.tokens = options.maxRequests;
      this.refillInterval = options.windowMs;
      this.lastRefill = Date.now();
    }
  }
  private refill(): void {
    if (stryMutAct_9fa48('4054')) {
      {
      }
    } else {
      stryCov_9fa48('4054');
      const now = Date.now();
      const elapsed = stryMutAct_9fa48('4055')
        ? now + this.lastRefill
        : (stryCov_9fa48('4055'), now - this.lastRefill);
      const tokensToAdd = stryMutAct_9fa48('4056')
        ? Math.floor(elapsed / this.refillInterval) / this.maxTokens
        : (stryCov_9fa48('4056'),
          Math.floor(
            stryMutAct_9fa48('4057')
              ? elapsed * this.refillInterval
              : (stryCov_9fa48('4057'), elapsed / this.refillInterval)
          ) * this.maxTokens);
      if (
        stryMutAct_9fa48('4061')
          ? tokensToAdd <= 0
          : stryMutAct_9fa48('4060')
            ? tokensToAdd >= 0
            : stryMutAct_9fa48('4059')
              ? false
              : stryMutAct_9fa48('4058')
                ? true
                : (stryCov_9fa48('4058', '4059', '4060', '4061'), tokensToAdd > 0)
      ) {
        if (stryMutAct_9fa48('4062')) {
          {
          }
        } else {
          stryCov_9fa48('4062');
          this.tokens = stryMutAct_9fa48('4063')
            ? Math.max(this.maxTokens, this.tokens + tokensToAdd)
            : (stryCov_9fa48('4063'),
              Math.min(
                this.maxTokens,
                stryMutAct_9fa48('4064')
                  ? this.tokens - tokensToAdd
                  : (stryCov_9fa48('4064'), this.tokens + tokensToAdd)
              ));
          this.lastRefill = now;
        }
      }
    }
  }
  async acquire(): Promise<void> {
    if (stryMutAct_9fa48('4065')) {
      {
      }
    } else {
      stryCov_9fa48('4065');
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48('4066')) {
          {
          }
        } else {
          stryCov_9fa48('4066');
          this.refill();
          if (
            stryMutAct_9fa48('4070')
              ? this.tokens < 1
              : stryMutAct_9fa48('4069')
                ? this.tokens > 1
                : stryMutAct_9fa48('4068')
                  ? false
                  : stryMutAct_9fa48('4067')
                    ? true
                    : (stryCov_9fa48('4067', '4068', '4069', '4070'), this.tokens >= 1)
          ) {
            if (stryMutAct_9fa48('4071')) {
              {
              }
            } else {
              stryCov_9fa48('4071');
              stryMutAct_9fa48('4072') ? this.tokens++ : (stryCov_9fa48('4072'), this.tokens--);
              resolve();
              return;
            }
          }
          this.queue.push(
            stryMutAct_9fa48('4073')
              ? {}
              : (stryCov_9fa48('4073'),
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
    if (stryMutAct_9fa48('4074')) {
      {
      }
    } else {
      stryCov_9fa48('4074');
      if (
        stryMutAct_9fa48('4076')
          ? false
          : stryMutAct_9fa48('4075')
            ? true
            : (stryCov_9fa48('4075', '4076'), this.processing)
      )
        return;
      this.processing = stryMutAct_9fa48('4077') ? false : (stryCov_9fa48('4077'), true);
      const processQueue = () => {
        if (stryMutAct_9fa48('4078')) {
          {
          }
        } else {
          stryCov_9fa48('4078');
          this.refill();
          while (
            stryMutAct_9fa48('4080')
              ? this.queue.length > 0 || this.tokens >= 1
              : stryMutAct_9fa48('4079')
                ? false
                : (stryCov_9fa48('4079', '4080'),
                  (stryMutAct_9fa48('4083')
                    ? this.queue.length <= 0
                    : stryMutAct_9fa48('4082')
                      ? this.queue.length >= 0
                      : stryMutAct_9fa48('4081')
                        ? true
                        : (stryCov_9fa48('4081', '4082', '4083'), this.queue.length > 0)) &&
                    (stryMutAct_9fa48('4086')
                      ? this.tokens < 1
                      : stryMutAct_9fa48('4085')
                        ? this.tokens > 1
                        : stryMutAct_9fa48('4084')
                          ? true
                          : (stryCov_9fa48('4084', '4085', '4086'), this.tokens >= 1)))
          ) {
            if (stryMutAct_9fa48('4087')) {
              {
              }
            } else {
              stryCov_9fa48('4087');
              stryMutAct_9fa48('4088') ? this.tokens++ : (stryCov_9fa48('4088'), this.tokens--);
              const request = this.queue.shift();
              stryMutAct_9fa48('4089')
                ? request.resolve()
                : (stryCov_9fa48('4089'), request?.resolve());
            }
          }
          if (
            stryMutAct_9fa48('4093')
              ? this.queue.length <= 0
              : stryMutAct_9fa48('4092')
                ? this.queue.length >= 0
                : stryMutAct_9fa48('4091')
                  ? false
                  : stryMutAct_9fa48('4090')
                    ? true
                    : (stryCov_9fa48('4090', '4091', '4092', '4093'), this.queue.length > 0)
          ) {
            if (stryMutAct_9fa48('4094')) {
              {
              }
            } else {
              stryCov_9fa48('4094');
              setTimeout(processQueue, 100);
            }
          } else {
            if (stryMutAct_9fa48('4095')) {
              {
              }
            } else {
              stryCov_9fa48('4095');
              this.processing = stryMutAct_9fa48('4096') ? true : (stryCov_9fa48('4096'), false);
            }
          }
        }
      };
      processQueue();
    }
  }
  getQueueLength(): number {
    if (stryMutAct_9fa48('4097')) {
      {
      }
    } else {
      stryCov_9fa48('4097');
      return this.queue.length;
    }
  }
  isOverLimit(): boolean {
    if (stryMutAct_9fa48('4098')) {
      {
      }
    } else {
      stryCov_9fa48('4098');
      return stryMutAct_9fa48('4102')
        ? this.queue.length <= 1000
        : stryMutAct_9fa48('4101')
          ? this.queue.length >= 1000
          : stryMutAct_9fa48('4100')
            ? false
            : stryMutAct_9fa48('4099')
              ? true
              : (stryCov_9fa48('4099', '4100', '4101', '4102'), this.queue.length > 1000);
    }
  }
}
export function createRateLimiter(maxRequestsPerSecond = 10): RateLimiter {
  if (stryMutAct_9fa48('4103')) {
    {
    }
  } else {
    stryCov_9fa48('4103');
    return new RateLimiter(
      stryMutAct_9fa48('4104')
        ? {}
        : (stryCov_9fa48('4104'),
          {
            maxRequests: maxRequestsPerSecond,
            windowMs: 1000,
          })
    );
  }
}
export const llmRateLimiter = createRateLimiter(10);
export async function withRateLimit<T>(limiter: RateLimiter, fn: () => Promise<T>): Promise<T> {
  if (stryMutAct_9fa48('4105')) {
    {
    }
  } else {
    stryCov_9fa48('4105');
    if (
      stryMutAct_9fa48('4107')
        ? false
        : stryMutAct_9fa48('4106')
          ? true
          : (stryCov_9fa48('4106', '4107'), limiter.isOverLimit())
    ) {
      if (stryMutAct_9fa48('4108')) {
        {
        }
      } else {
        stryCov_9fa48('4108');
        warn(
          stryMutAct_9fa48('4109') ? '' : (stryCov_9fa48('4109'), 'Rate limit queue full'),
          stryMutAct_9fa48('4110')
            ? {}
            : (stryCov_9fa48('4110'),
              {
                queueLength: limiter.getQueueLength(),
              })
        );
        throw new Error(
          stryMutAct_9fa48('4111') ? '' : (stryCov_9fa48('4111'), '429 Too Many Requests')
        );
      }
    }
    await limiter.acquire();
    return fn();
  }
}
