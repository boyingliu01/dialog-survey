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
  if (stryMutAct_9fa48('791')) {
    {
    }
  } else {
    stryCov_9fa48('791');
    const emailRegex = stryMutAct_9fa48('802')
      ? /^[^\s@]+@[^\s@]+\.[^\S@]+$/
      : stryMutAct_9fa48('801')
        ? /^[^\s@]+@[^\s@]+\.[\s@]+$/
        : stryMutAct_9fa48('800')
          ? /^[^\s@]+@[^\s@]+\.[^\s@]$/
          : stryMutAct_9fa48('799')
            ? /^[^\s@]+@[^\S@]+\.[^\s@]+$/
            : stryMutAct_9fa48('798')
              ? /^[^\s@]+@[\s@]+\.[^\s@]+$/
              : stryMutAct_9fa48('797')
                ? /^[^\s@]+@[^\s@]\.[^\s@]+$/
                : stryMutAct_9fa48('796')
                  ? /^[^\S@]+@[^\s@]+\.[^\s@]+$/
                  : stryMutAct_9fa48('795')
                    ? /^[\s@]+@[^\s@]+\.[^\s@]+$/
                    : stryMutAct_9fa48('794')
                      ? /^[^\s@]@[^\s@]+\.[^\s@]+$/
                      : stryMutAct_9fa48('793')
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+/
                        : stryMutAct_9fa48('792')
                          ? /[^\s@]+@[^\s@]+\.[^\s@]+$/
                          : (stryCov_9fa48(
                              '792',
                              '793',
                              '794',
                              '795',
                              '796',
                              '797',
                              '798',
                              '799',
                              '800',
                              '801',
                              '802'
                            ),
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return emailRegex.test(email);
  }
}
export function isValidPhone(phone: string): boolean {
  if (stryMutAct_9fa48('803')) {
    {
    }
  } else {
    stryCov_9fa48('803');
    const phoneRegex = stryMutAct_9fa48('808')
      ? /^1[3-9]\D{9}$/
      : stryMutAct_9fa48('807')
        ? /^1[3-9]\d$/
        : stryMutAct_9fa48('806')
          ? /^1[^3-9]\d{9}$/
          : stryMutAct_9fa48('805')
            ? /^1[3-9]\d{9}/
            : stryMutAct_9fa48('804')
              ? /1[3-9]\d{9}$/
              : (stryCov_9fa48('804', '805', '806', '807', '808'), /^1[3-9]\d{9}$/);
    return phoneRegex.test(phone);
  }
}
export function isValidUrl(url: string): boolean {
  if (stryMutAct_9fa48('809')) {
    {
    }
  } else {
    stryCov_9fa48('809');
    try {
      if (stryMutAct_9fa48('810')) {
        {
        }
      } else {
        stryCov_9fa48('810');
        new URL(url);
        return stryMutAct_9fa48('811') ? false : (stryCov_9fa48('811'), true);
      }
    } catch {
      if (stryMutAct_9fa48('812')) {
        {
        }
      } else {
        stryCov_9fa48('812');
        return stryMutAct_9fa48('813') ? true : (stryCov_9fa48('813'), false);
      }
    }
  }
}
export function isValidUUID(uuid: string): boolean {
  if (stryMutAct_9fa48('814')) {
    {
    }
  } else {
    stryCov_9fa48('814');
    const uuidRegex = stryMutAct_9fa48('828')
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i
      : stryMutAct_9fa48('827')
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i
        : stryMutAct_9fa48('826')
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i
          : stryMutAct_9fa48('825')
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i
            : stryMutAct_9fa48('824')
              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
              : stryMutAct_9fa48('823')
                ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                : stryMutAct_9fa48('822')
                  ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                  : stryMutAct_9fa48('821')
                    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                    : stryMutAct_9fa48('820')
                      ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                      : stryMutAct_9fa48('819')
                        ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                        : stryMutAct_9fa48('818')
                          ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                          : stryMutAct_9fa48('817')
                            ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                            : stryMutAct_9fa48('816')
                              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
                              : stryMutAct_9fa48('815')
                                ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                                : (stryCov_9fa48(
                                    '815',
                                    '816',
                                    '817',
                                    '818',
                                    '819',
                                    '820',
                                    '821',
                                    '822',
                                    '823',
                                    '824',
                                    '825',
                                    '826',
                                    '827',
                                    '828'
                                  ),
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return uuidRegex.test(uuid);
  }
}
export function isValidDingTalkUserId(userId: string): boolean {
  if (stryMutAct_9fa48('829')) {
    {
    }
  } else {
    stryCov_9fa48('829');
    return stryMutAct_9fa48('832')
      ? (!!userId && userId.length > 0) || userId.length <= 64
      : stryMutAct_9fa48('831')
        ? false
        : stryMutAct_9fa48('830')
          ? true
          : (stryCov_9fa48('830', '831', '832'),
            (stryMutAct_9fa48('834')
              ? !!userId || userId.length > 0
              : stryMutAct_9fa48('833')
                ? true
                : (stryCov_9fa48('833', '834'),
                  (stryMutAct_9fa48('835')
                    ? !userId
                    : (stryCov_9fa48('835'),
                      !(stryMutAct_9fa48('836') ? userId : (stryCov_9fa48('836'), !userId)))) &&
                    (stryMutAct_9fa48('839')
                      ? userId.length <= 0
                      : stryMutAct_9fa48('838')
                        ? userId.length >= 0
                        : stryMutAct_9fa48('837')
                          ? true
                          : (stryCov_9fa48('837', '838', '839'), userId.length > 0)))) &&
              (stryMutAct_9fa48('842')
                ? userId.length > 64
                : stryMutAct_9fa48('841')
                  ? userId.length < 64
                  : stryMutAct_9fa48('840')
                    ? true
                    : (stryCov_9fa48('840', '841', '842'), userId.length <= 64)));
  }
}
export function isNonEmptyString(value: unknown): value is string {
  if (stryMutAct_9fa48('843')) {
    {
    }
  } else {
    stryCov_9fa48('843');
    return stryMutAct_9fa48('846')
      ? typeof value === 'string' || value.trim().length > 0
      : stryMutAct_9fa48('845')
        ? false
        : stryMutAct_9fa48('844')
          ? true
          : (stryCov_9fa48('844', '845', '846'),
            (stryMutAct_9fa48('848')
              ? typeof value !== 'string'
              : stryMutAct_9fa48('847')
                ? true
                : (stryCov_9fa48('847', '848'),
                  typeof value ===
                    (stryMutAct_9fa48('849') ? '' : (stryCov_9fa48('849'), 'string')))) &&
              (stryMutAct_9fa48('852')
                ? value.trim().length <= 0
                : stryMutAct_9fa48('851')
                  ? value.trim().length >= 0
                  : stryMutAct_9fa48('850')
                    ? true
                    : (stryCov_9fa48('850', '851', '852'),
                      (stryMutAct_9fa48('853')
                        ? value.length
                        : (stryCov_9fa48('853'), value.trim().length)) > 0)));
  }
}
export function isPositiveInteger(value: unknown): value is number {
  if (stryMutAct_9fa48('854')) {
    {
    }
  } else {
    stryCov_9fa48('854');
    return stryMutAct_9fa48('857')
      ? (typeof value === 'number' && Number.isInteger(value)) || value > 0
      : stryMutAct_9fa48('856')
        ? false
        : stryMutAct_9fa48('855')
          ? true
          : (stryCov_9fa48('855', '856', '857'),
            (stryMutAct_9fa48('859')
              ? typeof value === 'number' || Number.isInteger(value)
              : stryMutAct_9fa48('858')
                ? true
                : (stryCov_9fa48('858', '859'),
                  (stryMutAct_9fa48('861')
                    ? typeof value !== 'number'
                    : stryMutAct_9fa48('860')
                      ? true
                      : (stryCov_9fa48('860', '861'),
                        typeof value ===
                          (stryMutAct_9fa48('862') ? '' : (stryCov_9fa48('862'), 'number')))) &&
                    Number.isInteger(value))) &&
              (stryMutAct_9fa48('865')
                ? value <= 0
                : stryMutAct_9fa48('864')
                  ? value >= 0
                  : stryMutAct_9fa48('863')
                    ? true
                    : (stryCov_9fa48('863', '864', '865'), value > 0)));
  }
}
