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
  private queue: QueuedRequest[] = [];
  private processing = false;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxRequests;
    this.tokens = options.maxRequests;
    this.refillInterval = options.windowMs;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.maxTokens;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens--;
        resolve();
        return;
      }

      this.queue.push({ resolve, reject, timestamp: Date.now() });
      this.scheduleProcessing();
    });
  }

  private scheduleProcessing(): void {
    if (this.processing) return;
    this.processing = true;

    const processQueue = () => {
      this.refill();

      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens--;
        const request = this.queue.shift();
        request?.resolve();
      }

      if (this.queue.length > 0) {
        setTimeout(processQueue, 100);
      } else {
        this.processing = false;
      }
    };

    processQueue();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isOverLimit(): boolean {
    return this.queue.length > 1000;
  }
}

export function createRateLimiter(maxRequestsPerSecond = 10): RateLimiter {
  return new RateLimiter({
    maxRequests: maxRequestsPerSecond,
    windowMs: 1000,
  });
}

export const llmRateLimiter = createRateLimiter(10);

export async function withRateLimit<T>(limiter: RateLimiter, fn: () => Promise<T>): Promise<T> {
  if (limiter.isOverLimit()) {
    warn('Rate limit queue full', { queueLength: limiter.getQueueLength() });
    throw new Error('429 Too Many Requests');
  }

  await limiter.acquire();
  return fn();
}
