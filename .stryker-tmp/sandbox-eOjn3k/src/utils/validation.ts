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
  if (stryMutAct_9fa48('524')) {
    {
    }
  } else {
    stryCov_9fa48('524');
    const emailRegex = stryMutAct_9fa48('535')
      ? /^[^\s@]+@[^\s@]+\.[^\S@]+$/
      : stryMutAct_9fa48('534')
        ? /^[^\s@]+@[^\s@]+\.[\s@]+$/
        : stryMutAct_9fa48('533')
          ? /^[^\s@]+@[^\s@]+\.[^\s@]$/
          : stryMutAct_9fa48('532')
            ? /^[^\s@]+@[^\S@]+\.[^\s@]+$/
            : stryMutAct_9fa48('531')
              ? /^[^\s@]+@[\s@]+\.[^\s@]+$/
              : stryMutAct_9fa48('530')
                ? /^[^\s@]+@[^\s@]\.[^\s@]+$/
                : stryMutAct_9fa48('529')
                  ? /^[^\S@]+@[^\s@]+\.[^\s@]+$/
                  : stryMutAct_9fa48('528')
                    ? /^[\s@]+@[^\s@]+\.[^\s@]+$/
                    : stryMutAct_9fa48('527')
                      ? /^[^\s@]@[^\s@]+\.[^\s@]+$/
                      : stryMutAct_9fa48('526')
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+/
                        : stryMutAct_9fa48('525')
                          ? /[^\s@]+@[^\s@]+\.[^\s@]+$/
                          : (stryCov_9fa48(
                              '525',
                              '526',
                              '527',
                              '528',
                              '529',
                              '530',
                              '531',
                              '532',
                              '533',
                              '534',
                              '535'
                            ),
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return emailRegex.test(email);
  }
}
export function isValidPhone(phone: string): boolean {
  if (stryMutAct_9fa48('536')) {
    {
    }
  } else {
    stryCov_9fa48('536');
    const phoneRegex = stryMutAct_9fa48('541')
      ? /^1[3-9]\D{9}$/
      : stryMutAct_9fa48('540')
        ? /^1[3-9]\d$/
        : stryMutAct_9fa48('539')
          ? /^1[^3-9]\d{9}$/
          : stryMutAct_9fa48('538')
            ? /^1[3-9]\d{9}/
            : stryMutAct_9fa48('537')
              ? /1[3-9]\d{9}$/
              : (stryCov_9fa48('537', '538', '539', '540', '541'), /^1[3-9]\d{9}$/);
    return phoneRegex.test(phone);
  }
}
export function isValidUrl(url: string): boolean {
  if (stryMutAct_9fa48('542')) {
    {
    }
  } else {
    stryCov_9fa48('542');
    try {
      if (stryMutAct_9fa48('543')) {
        {
        }
      } else {
        stryCov_9fa48('543');
        new URL(url);
        return stryMutAct_9fa48('544') ? false : (stryCov_9fa48('544'), true);
      }
    } catch {
      if (stryMutAct_9fa48('545')) {
        {
        }
      } else {
        stryCov_9fa48('545');
        return stryMutAct_9fa48('546') ? true : (stryCov_9fa48('546'), false);
      }
    }
  }
}
export function isValidUUID(uuid: string): boolean {
  if (stryMutAct_9fa48('547')) {
    {
    }
  } else {
    stryCov_9fa48('547');
    const uuidRegex = stryMutAct_9fa48('561')
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i
      : stryMutAct_9fa48('560')
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i
        : stryMutAct_9fa48('559')
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i
          : stryMutAct_9fa48('558')
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i
            : stryMutAct_9fa48('557')
              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
              : stryMutAct_9fa48('556')
                ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                : stryMutAct_9fa48('555')
                  ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                  : stryMutAct_9fa48('554')
                    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                    : stryMutAct_9fa48('553')
                      ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                      : stryMutAct_9fa48('552')
                        ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                        : stryMutAct_9fa48('551')
                          ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                          : stryMutAct_9fa48('550')
                            ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                            : stryMutAct_9fa48('549')
                              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
                              : stryMutAct_9fa48('548')
                                ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                                : (stryCov_9fa48(
                                    '548',
                                    '549',
                                    '550',
                                    '551',
                                    '552',
                                    '553',
                                    '554',
                                    '555',
                                    '556',
                                    '557',
                                    '558',
                                    '559',
                                    '560',
                                    '561'
                                  ),
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return uuidRegex.test(uuid);
  }
}
export function isValidDingTalkUserId(userId: string): boolean {
  if (stryMutAct_9fa48('562')) {
    {
    }
  } else {
    stryCov_9fa48('562');
    return stryMutAct_9fa48('565')
      ? (!!userId && userId.length > 0) || userId.length <= 64
      : stryMutAct_9fa48('564')
        ? false
        : stryMutAct_9fa48('563')
          ? true
          : (stryCov_9fa48('563', '564', '565'),
            (stryMutAct_9fa48('567')
              ? !!userId || userId.length > 0
              : stryMutAct_9fa48('566')
                ? true
                : (stryCov_9fa48('566', '567'),
                  (stryMutAct_9fa48('568')
                    ? !userId
                    : (stryCov_9fa48('568'),
                      !(stryMutAct_9fa48('569') ? userId : (stryCov_9fa48('569'), !userId)))) &&
                    (stryMutAct_9fa48('572')
                      ? userId.length <= 0
                      : stryMutAct_9fa48('571')
                        ? userId.length >= 0
                        : stryMutAct_9fa48('570')
                          ? true
                          : (stryCov_9fa48('570', '571', '572'), userId.length > 0)))) &&
              (stryMutAct_9fa48('575')
                ? userId.length > 64
                : stryMutAct_9fa48('574')
                  ? userId.length < 64
                  : stryMutAct_9fa48('573')
                    ? true
                    : (stryCov_9fa48('573', '574', '575'), userId.length <= 64)));
  }
}
export function isNonEmptyString(value: unknown): value is string {
  if (stryMutAct_9fa48('576')) {
    {
    }
  } else {
    stryCov_9fa48('576');
    return stryMutAct_9fa48('579')
      ? typeof value === 'string' || value.trim().length > 0
      : stryMutAct_9fa48('578')
        ? false
        : stryMutAct_9fa48('577')
          ? true
          : (stryCov_9fa48('577', '578', '579'),
            (stryMutAct_9fa48('581')
              ? typeof value !== 'string'
              : stryMutAct_9fa48('580')
                ? true
                : (stryCov_9fa48('580', '581'),
                  typeof value ===
                    (stryMutAct_9fa48('582') ? '' : (stryCov_9fa48('582'), 'string')))) &&
              (stryMutAct_9fa48('585')
                ? value.trim().length <= 0
                : stryMutAct_9fa48('584')
                  ? value.trim().length >= 0
                  : stryMutAct_9fa48('583')
                    ? true
                    : (stryCov_9fa48('583', '584', '585'),
                      (stryMutAct_9fa48('586')
                        ? value.length
                        : (stryCov_9fa48('586'), value.trim().length)) > 0)));
  }
}
export function isPositiveInteger(value: unknown): value is number {
  if (stryMutAct_9fa48('587')) {
    {
    }
  } else {
    stryCov_9fa48('587');
    return stryMutAct_9fa48('590')
      ? (typeof value === 'number' && Number.isInteger(value)) || value > 0
      : stryMutAct_9fa48('589')
        ? false
        : stryMutAct_9fa48('588')
          ? true
          : (stryCov_9fa48('588', '589', '590'),
            (stryMutAct_9fa48('592')
              ? typeof value === 'number' || Number.isInteger(value)
              : stryMutAct_9fa48('591')
                ? true
                : (stryCov_9fa48('591', '592'),
                  (stryMutAct_9fa48('594')
                    ? typeof value !== 'number'
                    : stryMutAct_9fa48('593')
                      ? true
                      : (stryCov_9fa48('593', '594'),
                        typeof value ===
                          (stryMutAct_9fa48('595') ? '' : (stryCov_9fa48('595'), 'number')))) &&
                    Number.isInteger(value))) &&
              (stryMutAct_9fa48('598')
                ? value <= 0
                : stryMutAct_9fa48('597')
                  ? value >= 0
                  : stryMutAct_9fa48('596')
                    ? true
                    : (stryCov_9fa48('596', '597', '598'), value > 0)));
  }
}
