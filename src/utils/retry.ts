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
  const outcome = await runAttempts(fn, opts);
  if (outcome.value !== undefined || outcome.error === undefined) {
    return outcome.value as T;
  }
  throw outcome.error;
}

/** How a retry loop ended: either a value, or the last error it collected. */
interface AttemptOutcome<T> {
  value?: T;
  error?: Error;
}

/**
 * Run `fn` until it succeeds or must stop.
 *
 * The loop only advances the backoff; the decision to stop is `isFinished`'s, so
 * the two policies live apart. `error` is always set when `value` is not, which
 * is what lets the caller tell "returned undefined" from "never succeeded".
 */
async function runAttempts<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<AttemptOutcome<T>> {
  let error: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return { value: await fn() };
    } catch (e) {
      error = asError(e);
      // Stop retrying when the budget is spent or the error says it can never
      // succeed -- a 400 does not become a 200 on the next attempt, so retrying
      // it only delays the failure and spends the delay budget.
      if (isFinished(attempt, opts.maxRetries, e, opts.retryableStatuses)) break;
      await sleep(delay);
      delay = nextDelay(delay, opts);
    }
  }

  return { error: error ?? new Error('Retry failed') };
}

/** Coerce a thrown value into an Error, so callers never handle a bare `unknown`. */
function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** The next backoff delay, capped so a long run cannot stall for minutes. */
function nextDelay(delay: number, opts: RetryOptions): number {
  return Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
}

/**
 * Whether this attempt ends the loop.
 *
 * Two independent reasons, both meaning "do not sleep and try again": the retry
 * budget is exhausted, or the error is one that cannot be retried at all. The
 * distinction matters only to the caller, which receives `lastError` in both
 * cases.
 */
function isFinished(
  attempt: number,
  maxRetries: number,
  error: unknown,
  retryableStatuses: number[] | undefined
): boolean {
  if (attempt >= maxRetries) return true;
  return !isRetryable(error, retryableStatuses);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
