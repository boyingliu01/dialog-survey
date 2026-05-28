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
const DEFAULT_OPTIONS: RetryOptions = stryMutAct_9fa48('4112')
  ? {}
  : (stryCov_9fa48('4112'),
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
  if (stryMutAct_9fa48('4113')) {
    {
    }
  } else {
    stryCov_9fa48('4113');
    const opts = stryMutAct_9fa48('4114')
      ? {}
      : (stryCov_9fa48('4114'),
        {
          ...DEFAULT_OPTIONS,
          ...options,
        });
    let lastError: Error | undefined;
    let delay = opts.initialDelayMs;
    for (
      let attempt = 0;
      stryMutAct_9fa48('4117')
        ? attempt > opts.maxRetries
        : stryMutAct_9fa48('4116')
          ? attempt < opts.maxRetries
          : stryMutAct_9fa48('4115')
            ? false
            : (stryCov_9fa48('4115', '4116', '4117'), attempt <= opts.maxRetries);
      stryMutAct_9fa48('4118') ? attempt-- : (stryCov_9fa48('4118'), attempt++)
    ) {
      if (stryMutAct_9fa48('4119')) {
        {
        }
      } else {
        stryCov_9fa48('4119');
        try {
          if (stryMutAct_9fa48('4120')) {
            {
            }
          } else {
            stryCov_9fa48('4120');
            return await fn();
          }
        } catch (e) {
          if (stryMutAct_9fa48('4121')) {
            {
            }
          } else {
            stryCov_9fa48('4121');
            lastError = e instanceof Error ? e : new Error(String(e));
            if (
              stryMutAct_9fa48('4125')
                ? attempt >= opts.maxRetries
                : stryMutAct_9fa48('4124')
                  ? attempt <= opts.maxRetries
                  : stryMutAct_9fa48('4123')
                    ? false
                    : stryMutAct_9fa48('4122')
                      ? true
                      : (stryCov_9fa48('4122', '4123', '4124', '4125'), attempt < opts.maxRetries)
            ) {
              if (stryMutAct_9fa48('4126')) {
                {
                }
              } else {
                stryCov_9fa48('4126');
                await sleep(delay);
                delay = stryMutAct_9fa48('4127')
                  ? Math.max(delay * opts.backoffMultiplier, opts.maxDelayMs)
                  : (stryCov_9fa48('4127'),
                    Math.min(
                      stryMutAct_9fa48('4128')
                        ? delay / opts.backoffMultiplier
                        : (stryCov_9fa48('4128'), delay * opts.backoffMultiplier),
                      opts.maxDelayMs
                    ));
              }
            }
          }
        }
      }
    }
    throw stryMutAct_9fa48('4131')
      ? lastError && new Error('Retry failed')
      : stryMutAct_9fa48('4130')
        ? false
        : stryMutAct_9fa48('4129')
          ? true
          : (stryCov_9fa48('4129', '4130', '4131'),
            lastError ||
              new Error(stryMutAct_9fa48('4132') ? '' : (stryCov_9fa48('4132'), 'Retry failed')));
  }
}
function sleep(ms: number): Promise<void> {
  if (stryMutAct_9fa48('4133')) {
    {
    }
  } else {
    stryCov_9fa48('4133');
    return new Promise(
      stryMutAct_9fa48('4134')
        ? () => undefined
        : (stryCov_9fa48('4134'), (resolve) => setTimeout(resolve, ms))
    );
  }
}
