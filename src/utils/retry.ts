export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry (default: 429, 5xx) */
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [429, ...Array.from({ length: 100 }, (_, i) => 500 + i)],
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Decide whether a caught error should be retried at all.
 *
 * Only a `RetryError` carrying a status code outside `retryableStatuses` is
 * fatal; every other error (plain `Error`, network failure, or a `RetryError`
 * with no status code) is treated as transient. Extracted from `withRetry` so
 * the retry loop reads as four flat steps instead of three nested branches —
 * the nesting was what pushed this function's cognitive complexity to 20.
 */
function isRetryable(error: unknown, retryableStatuses: number[] | undefined): boolean {
  if (!(error instanceof RetryError)) return true;
  if (!error.statusCode) return true;
  return retryableStatuses?.includes(error.statusCode) ?? false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt >= opts.maxRetries) continue;
      // A non-retryable status code (e.g. 400) fails fast rather than burning
      // the remaining attempts on a request that cannot succeed.
      if (!isRetryable(e, opts.retryableStatuses)) throw e;

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
