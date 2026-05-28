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
export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}
const DEFAULT_OPTIONS: RetryOptions = stryMutAct_9fa48('701')
  ? {}
  : (stryCov_9fa48('701'),
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    });
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  if (stryMutAct_9fa48('702')) {
    {
    }
  } else {
    stryCov_9fa48('702');
    const opts = stryMutAct_9fa48('703')
      ? {}
      : (stryCov_9fa48('703'),
        {
          ...DEFAULT_OPTIONS,
          ...options,
        });
    let lastError: Error | undefined;
    let delay = opts.initialDelayMs;
    for (
      let attempt = 0;
      stryMutAct_9fa48('706')
        ? attempt > opts.maxRetries
        : stryMutAct_9fa48('705')
          ? attempt < opts.maxRetries
          : stryMutAct_9fa48('704')
            ? false
            : (stryCov_9fa48('704', '705', '706'), attempt <= opts.maxRetries);
      stryMutAct_9fa48('707') ? attempt-- : (stryCov_9fa48('707'), attempt++)
    ) {
      if (stryMutAct_9fa48('708')) {
        {
        }
      } else {
        stryCov_9fa48('708');
        try {
          if (stryMutAct_9fa48('709')) {
            {
            }
          } else {
            stryCov_9fa48('709');
            return await fn();
          }
        } catch (e) {
          if (stryMutAct_9fa48('710')) {
            {
            }
          } else {
            stryCov_9fa48('710');
            lastError = e instanceof Error ? e : new Error(String(e));
            if (
              stryMutAct_9fa48('714')
                ? attempt >= opts.maxRetries
                : stryMutAct_9fa48('713')
                  ? attempt <= opts.maxRetries
                  : stryMutAct_9fa48('712')
                    ? false
                    : stryMutAct_9fa48('711')
                      ? true
                      : (stryCov_9fa48('711', '712', '713', '714'), attempt < opts.maxRetries)
            ) {
              if (stryMutAct_9fa48('715')) {
                {
                }
              } else {
                stryCov_9fa48('715');
                await sleep(delay);
                delay = stryMutAct_9fa48('716')
                  ? Math.max(delay * opts.backoffMultiplier, opts.maxDelayMs)
                  : (stryCov_9fa48('716'),
                    Math.min(
                      stryMutAct_9fa48('717')
                        ? delay / opts.backoffMultiplier
                        : (stryCov_9fa48('717'), delay * opts.backoffMultiplier),
                      opts.maxDelayMs
                    ));
              }
            }
          }
        }
      }
    }
    throw stryMutAct_9fa48('720')
      ? lastError && new Error('Retry failed')
      : stryMutAct_9fa48('719')
        ? false
        : stryMutAct_9fa48('718')
          ? true
          : (stryCov_9fa48('718', '719', '720'),
            lastError ||
              new Error(stryMutAct_9fa48('721') ? '' : (stryCov_9fa48('721'), 'Retry failed')));
  }
}
function sleep(ms: number): Promise<void> {
  if (stryMutAct_9fa48('722')) {
    {
    }
  } else {
    stryCov_9fa48('722');
    return new Promise(
      stryMutAct_9fa48('723')
        ? () => undefined
        : (stryCov_9fa48('723'), (resolve) => setTimeout(resolve, ms))
    );
  }
}
