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
const DEFAULT_OPTIONS: RetryOptions = stryMutAct_9fa48('837')
  ? {}
  : (stryCov_9fa48('837'),
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
  if (stryMutAct_9fa48('838')) {
    {
    }
  } else {
    stryCov_9fa48('838');
    const opts = stryMutAct_9fa48('839')
      ? {}
      : (stryCov_9fa48('839'),
        {
          ...DEFAULT_OPTIONS,
          ...options,
        });
    let lastError: Error | undefined;
    let delay = opts.initialDelayMs;
    for (
      let attempt = 0;
      stryMutAct_9fa48('842')
        ? attempt > opts.maxRetries
        : stryMutAct_9fa48('841')
          ? attempt < opts.maxRetries
          : stryMutAct_9fa48('840')
            ? false
            : (stryCov_9fa48('840', '841', '842'), attempt <= opts.maxRetries);
      stryMutAct_9fa48('843') ? attempt-- : (stryCov_9fa48('843'), attempt++)
    ) {
      if (stryMutAct_9fa48('844')) {
        {
        }
      } else {
        stryCov_9fa48('844');
        try {
          if (stryMutAct_9fa48('845')) {
            {
            }
          } else {
            stryCov_9fa48('845');
            return await fn();
          }
        } catch (e) {
          if (stryMutAct_9fa48('846')) {
            {
            }
          } else {
            stryCov_9fa48('846');
            lastError = e instanceof Error ? e : new Error(String(e));
            if (
              stryMutAct_9fa48('850')
                ? attempt >= opts.maxRetries
                : stryMutAct_9fa48('849')
                  ? attempt <= opts.maxRetries
                  : stryMutAct_9fa48('848')
                    ? false
                    : stryMutAct_9fa48('847')
                      ? true
                      : (stryCov_9fa48('847', '848', '849', '850'), attempt < opts.maxRetries)
            ) {
              if (stryMutAct_9fa48('851')) {
                {
                }
              } else {
                stryCov_9fa48('851');
                await sleep(delay);
                delay = stryMutAct_9fa48('852')
                  ? Math.max(delay * opts.backoffMultiplier, opts.maxDelayMs)
                  : (stryCov_9fa48('852'),
                    Math.min(
                      stryMutAct_9fa48('853')
                        ? delay / opts.backoffMultiplier
                        : (stryCov_9fa48('853'), delay * opts.backoffMultiplier),
                      opts.maxDelayMs
                    ));
              }
            }
          }
        }
      }
    }
    throw stryMutAct_9fa48('856')
      ? lastError && new Error('Retry failed')
      : stryMutAct_9fa48('855')
        ? false
        : stryMutAct_9fa48('854')
          ? true
          : (stryCov_9fa48('854', '855', '856'),
            lastError ||
              new Error(stryMutAct_9fa48('857') ? '' : (stryCov_9fa48('857'), 'Retry failed')));
  }
}
function sleep(ms: number): Promise<void> {
  if (stryMutAct_9fa48('858')) {
    {
    }
  } else {
    stryCov_9fa48('858');
    return new Promise(
      stryMutAct_9fa48('859')
        ? () => undefined
        : (stryCov_9fa48('859'), (resolve) => setTimeout(resolve, ms))
    );
  }
}
