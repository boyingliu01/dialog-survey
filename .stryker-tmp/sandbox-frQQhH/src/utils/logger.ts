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
import pino from 'pino';
const logger = pino(
  stryMutAct_9fa48('550')
    ? {}
    : (stryCov_9fa48('550'),
      {
        level: stryMutAct_9fa48('553')
          ? process.env.LOG_LEVEL && 'info'
          : stryMutAct_9fa48('552')
            ? false
            : stryMutAct_9fa48('551')
              ? true
              : (stryCov_9fa48('551', '552', '553'),
                process.env.LOG_LEVEL ||
                  (stryMutAct_9fa48('554') ? '' : (stryCov_9fa48('554'), 'info'))),
        transport: (
          stryMutAct_9fa48('557')
            ? process.env.NODE_ENV !== 'development'
            : stryMutAct_9fa48('556')
              ? false
              : stryMutAct_9fa48('555')
                ? true
                : (stryCov_9fa48('555', '556', '557'),
                  process.env.NODE_ENV ===
                    (stryMutAct_9fa48('558') ? '' : (stryCov_9fa48('558'), 'development')))
        )
          ? stryMutAct_9fa48('559')
            ? {}
            : (stryCov_9fa48('559'),
              {
                target: stryMutAct_9fa48('560') ? '' : (stryCov_9fa48('560'), 'pino-pretty'),
                options: stryMutAct_9fa48('561')
                  ? {}
                  : (stryCov_9fa48('561'),
                    {
                      colorize: stryMutAct_9fa48('562') ? false : (stryCov_9fa48('562'), true),
                    }),
              })
          : undefined,
      })
);
export function info(message: string, meta?: Record<string, unknown>) {
  if (stryMutAct_9fa48('563')) {
    {
    }
  } else {
    stryCov_9fa48('563');
    logger.info(meta, message);
  }
}
export function warn(message: string, meta?: Record<string, unknown>) {
  if (stryMutAct_9fa48('564')) {
    {
    }
  } else {
    stryCov_9fa48('564');
    logger.warn(meta, message);
  }
}
export function error(message: string, meta?: Record<string, unknown>) {
  if (stryMutAct_9fa48('565')) {
    {
    }
  } else {
    stryCov_9fa48('565');
    logger.error(meta, message);
  }
}
export function debug(message: string, meta?: Record<string, unknown>) {
  if (stryMutAct_9fa48('566')) {
    {
    }
  } else {
    stryCov_9fa48('566');
    logger.debug(meta, message);
  }
}
export { logger };
