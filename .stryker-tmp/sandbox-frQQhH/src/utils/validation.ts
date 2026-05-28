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
export function isValidEmail(email: string): boolean {
  if (stryMutAct_9fa48('589')) {
    {
    }
  } else {
    stryCov_9fa48('589');
    const emailRegex = stryMutAct_9fa48('600')
      ? /^[^\s@]+@[^\s@]+\.[^\S@]+$/
      : stryMutAct_9fa48('599')
        ? /^[^\s@]+@[^\s@]+\.[\s@]+$/
        : stryMutAct_9fa48('598')
          ? /^[^\s@]+@[^\s@]+\.[^\s@]$/
          : stryMutAct_9fa48('597')
            ? /^[^\s@]+@[^\S@]+\.[^\s@]+$/
            : stryMutAct_9fa48('596')
              ? /^[^\s@]+@[\s@]+\.[^\s@]+$/
              : stryMutAct_9fa48('595')
                ? /^[^\s@]+@[^\s@]\.[^\s@]+$/
                : stryMutAct_9fa48('594')
                  ? /^[^\S@]+@[^\s@]+\.[^\s@]+$/
                  : stryMutAct_9fa48('593')
                    ? /^[\s@]+@[^\s@]+\.[^\s@]+$/
                    : stryMutAct_9fa48('592')
                      ? /^[^\s@]@[^\s@]+\.[^\s@]+$/
                      : stryMutAct_9fa48('591')
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+/
                        : stryMutAct_9fa48('590')
                          ? /[^\s@]+@[^\s@]+\.[^\s@]+$/
                          : (stryCov_9fa48(
                              '590',
                              '591',
                              '592',
                              '593',
                              '594',
                              '595',
                              '596',
                              '597',
                              '598',
                              '599',
                              '600'
                            ),
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return emailRegex.test(email);
  }
}
export function isValidPhone(phone: string): boolean {
  if (stryMutAct_9fa48('601')) {
    {
    }
  } else {
    stryCov_9fa48('601');
    const phoneRegex = stryMutAct_9fa48('606')
      ? /^1[3-9]\D{9}$/
      : stryMutAct_9fa48('605')
        ? /^1[3-9]\d$/
        : stryMutAct_9fa48('604')
          ? /^1[^3-9]\d{9}$/
          : stryMutAct_9fa48('603')
            ? /^1[3-9]\d{9}/
            : stryMutAct_9fa48('602')
              ? /1[3-9]\d{9}$/
              : (stryCov_9fa48('602', '603', '604', '605', '606'), /^1[3-9]\d{9}$/);
    return phoneRegex.test(phone);
  }
}
export function isValidUrl(url: string): boolean {
  if (stryMutAct_9fa48('607')) {
    {
    }
  } else {
    stryCov_9fa48('607');
    try {
      if (stryMutAct_9fa48('608')) {
        {
        }
      } else {
        stryCov_9fa48('608');
        new URL(url);
        return stryMutAct_9fa48('609') ? false : (stryCov_9fa48('609'), true);
      }
    } catch {
      if (stryMutAct_9fa48('610')) {
        {
        }
      } else {
        stryCov_9fa48('610');
        return stryMutAct_9fa48('611') ? true : (stryCov_9fa48('611'), false);
      }
    }
  }
}
export function isValidUUID(uuid: string): boolean {
  if (stryMutAct_9fa48('612')) {
    {
    }
  } else {
    stryCov_9fa48('612');
    const uuidRegex = stryMutAct_9fa48('626')
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i
      : stryMutAct_9fa48('625')
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i
        : stryMutAct_9fa48('624')
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i
          : stryMutAct_9fa48('623')
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i
            : stryMutAct_9fa48('622')
              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
              : stryMutAct_9fa48('621')
                ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                : stryMutAct_9fa48('620')
                  ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                  : stryMutAct_9fa48('619')
                    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                    : stryMutAct_9fa48('618')
                      ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                      : stryMutAct_9fa48('617')
                        ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                        : stryMutAct_9fa48('616')
                          ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                          : stryMutAct_9fa48('615')
                            ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                            : stryMutAct_9fa48('614')
                              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
                              : stryMutAct_9fa48('613')
                                ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                                : (stryCov_9fa48(
                                    '613',
                                    '614',
                                    '615',
                                    '616',
                                    '617',
                                    '618',
                                    '619',
                                    '620',
                                    '621',
                                    '622',
                                    '623',
                                    '624',
                                    '625',
                                    '626'
                                  ),
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return uuidRegex.test(uuid);
  }
}
export function isValidDingTalkUserId(userId: string): boolean {
  if (stryMutAct_9fa48('627')) {
    {
    }
  } else {
    stryCov_9fa48('627');
    return stryMutAct_9fa48('630')
      ? (!!userId && userId.length > 0) || userId.length <= 64
      : stryMutAct_9fa48('629')
        ? false
        : stryMutAct_9fa48('628')
          ? true
          : (stryCov_9fa48('628', '629', '630'),
            (stryMutAct_9fa48('632')
              ? !!userId || userId.length > 0
              : stryMutAct_9fa48('631')
                ? true
                : (stryCov_9fa48('631', '632'),
                  (stryMutAct_9fa48('633')
                    ? !userId
                    : (stryCov_9fa48('633'),
                      !(stryMutAct_9fa48('634') ? userId : (stryCov_9fa48('634'), !userId)))) &&
                    (stryMutAct_9fa48('637')
                      ? userId.length <= 0
                      : stryMutAct_9fa48('636')
                        ? userId.length >= 0
                        : stryMutAct_9fa48('635')
                          ? true
                          : (stryCov_9fa48('635', '636', '637'), userId.length > 0)))) &&
              (stryMutAct_9fa48('640')
                ? userId.length > 64
                : stryMutAct_9fa48('639')
                  ? userId.length < 64
                  : stryMutAct_9fa48('638')
                    ? true
                    : (stryCov_9fa48('638', '639', '640'), userId.length <= 64)));
  }
}
export function isNonEmptyString(value: unknown): value is string {
  if (stryMutAct_9fa48('641')) {
    {
    }
  } else {
    stryCov_9fa48('641');
    return stryMutAct_9fa48('644')
      ? typeof value === 'string' || value.trim().length > 0
      : stryMutAct_9fa48('643')
        ? false
        : stryMutAct_9fa48('642')
          ? true
          : (stryCov_9fa48('642', '643', '644'),
            (stryMutAct_9fa48('646')
              ? typeof value !== 'string'
              : stryMutAct_9fa48('645')
                ? true
                : (stryCov_9fa48('645', '646'),
                  typeof value ===
                    (stryMutAct_9fa48('647') ? '' : (stryCov_9fa48('647'), 'string')))) &&
              (stryMutAct_9fa48('650')
                ? value.trim().length <= 0
                : stryMutAct_9fa48('649')
                  ? value.trim().length >= 0
                  : stryMutAct_9fa48('648')
                    ? true
                    : (stryCov_9fa48('648', '649', '650'),
                      (stryMutAct_9fa48('651')
                        ? value.length
                        : (stryCov_9fa48('651'), value.trim().length)) > 0)));
  }
}
export function isPositiveInteger(value: unknown): value is number {
  if (stryMutAct_9fa48('652')) {
    {
    }
  } else {
    stryCov_9fa48('652');
    return stryMutAct_9fa48('655')
      ? (typeof value === 'number' && Number.isInteger(value)) || value > 0
      : stryMutAct_9fa48('654')
        ? false
        : stryMutAct_9fa48('653')
          ? true
          : (stryCov_9fa48('653', '654', '655'),
            (stryMutAct_9fa48('657')
              ? typeof value === 'number' || Number.isInteger(value)
              : stryMutAct_9fa48('656')
                ? true
                : (stryCov_9fa48('656', '657'),
                  (stryMutAct_9fa48('659')
                    ? typeof value !== 'number'
                    : stryMutAct_9fa48('658')
                      ? true
                      : (stryCov_9fa48('658', '659'),
                        typeof value ===
                          (stryMutAct_9fa48('660') ? '' : (stryCov_9fa48('660'), 'number')))) &&
                    Number.isInteger(value))) &&
              (stryMutAct_9fa48('663')
                ? value <= 0
                : stryMutAct_9fa48('662')
                  ? value >= 0
                  : stryMutAct_9fa48('661')
                    ? true
                    : (stryCov_9fa48('661', '662', '663'), value > 0)));
  }
}
