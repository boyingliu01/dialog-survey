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
  if (stryMutAct_9fa48('4202')) {
    {
    }
  } else {
    stryCov_9fa48('4202');
    const emailRegex = stryMutAct_9fa48('4213')
      ? /^[^\s@]+@[^\s@]+\.[^\S@]+$/
      : stryMutAct_9fa48('4212')
        ? /^[^\s@]+@[^\s@]+\.[\s@]+$/
        : stryMutAct_9fa48('4211')
          ? /^[^\s@]+@[^\s@]+\.[^\s@]$/
          : stryMutAct_9fa48('4210')
            ? /^[^\s@]+@[^\S@]+\.[^\s@]+$/
            : stryMutAct_9fa48('4209')
              ? /^[^\s@]+@[\s@]+\.[^\s@]+$/
              : stryMutAct_9fa48('4208')
                ? /^[^\s@]+@[^\s@]\.[^\s@]+$/
                : stryMutAct_9fa48('4207')
                  ? /^[^\S@]+@[^\s@]+\.[^\s@]+$/
                  : stryMutAct_9fa48('4206')
                    ? /^[\s@]+@[^\s@]+\.[^\s@]+$/
                    : stryMutAct_9fa48('4205')
                      ? /^[^\s@]@[^\s@]+\.[^\s@]+$/
                      : stryMutAct_9fa48('4204')
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+/
                        : stryMutAct_9fa48('4203')
                          ? /[^\s@]+@[^\s@]+\.[^\s@]+$/
                          : (stryCov_9fa48(
                              '4203',
                              '4204',
                              '4205',
                              '4206',
                              '4207',
                              '4208',
                              '4209',
                              '4210',
                              '4211',
                              '4212',
                              '4213'
                            ),
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return emailRegex.test(email);
  }
}
export function isValidPhone(phone: string): boolean {
  if (stryMutAct_9fa48('4214')) {
    {
    }
  } else {
    stryCov_9fa48('4214');
    const phoneRegex = stryMutAct_9fa48('4219')
      ? /^1[3-9]\D{9}$/
      : stryMutAct_9fa48('4218')
        ? /^1[3-9]\d$/
        : stryMutAct_9fa48('4217')
          ? /^1[^3-9]\d{9}$/
          : stryMutAct_9fa48('4216')
            ? /^1[3-9]\d{9}/
            : stryMutAct_9fa48('4215')
              ? /1[3-9]\d{9}$/
              : (stryCov_9fa48('4215', '4216', '4217', '4218', '4219'), /^1[3-9]\d{9}$/);
    return phoneRegex.test(phone);
  }
}
export function isValidUrl(url: string): boolean {
  if (stryMutAct_9fa48('4220')) {
    {
    }
  } else {
    stryCov_9fa48('4220');
    try {
      if (stryMutAct_9fa48('4221')) {
        {
        }
      } else {
        stryCov_9fa48('4221');
        new URL(url);
        return stryMutAct_9fa48('4222') ? false : (stryCov_9fa48('4222'), true);
      }
    } catch {
      if (stryMutAct_9fa48('4223')) {
        {
        }
      } else {
        stryCov_9fa48('4223');
        return stryMutAct_9fa48('4224') ? true : (stryCov_9fa48('4224'), false);
      }
    }
  }
}
export function isValidUUID(uuid: string): boolean {
  if (stryMutAct_9fa48('4225')) {
    {
    }
  } else {
    stryCov_9fa48('4225');
    const uuidRegex = stryMutAct_9fa48('4239')
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i
      : stryMutAct_9fa48('4238')
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i
        : stryMutAct_9fa48('4237')
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i
          : stryMutAct_9fa48('4236')
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i
            : stryMutAct_9fa48('4235')
              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
              : stryMutAct_9fa48('4234')
                ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                : stryMutAct_9fa48('4233')
                  ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                  : stryMutAct_9fa48('4232')
                    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                    : stryMutAct_9fa48('4231')
                      ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                      : stryMutAct_9fa48('4230')
                        ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                        : stryMutAct_9fa48('4229')
                          ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                          : stryMutAct_9fa48('4228')
                            ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                            : stryMutAct_9fa48('4227')
                              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
                              : stryMutAct_9fa48('4226')
                                ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                                : (stryCov_9fa48(
                                    '4226',
                                    '4227',
                                    '4228',
                                    '4229',
                                    '4230',
                                    '4231',
                                    '4232',
                                    '4233',
                                    '4234',
                                    '4235',
                                    '4236',
                                    '4237',
                                    '4238',
                                    '4239'
                                  ),
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return uuidRegex.test(uuid);
  }
}
export function isValidDingTalkUserId(userId: string): boolean {
  if (stryMutAct_9fa48('4240')) {
    {
    }
  } else {
    stryCov_9fa48('4240');
    return stryMutAct_9fa48('4243')
      ? (!!userId && userId.length > 0) || userId.length <= 64
      : stryMutAct_9fa48('4242')
        ? false
        : stryMutAct_9fa48('4241')
          ? true
          : (stryCov_9fa48('4241', '4242', '4243'),
            (stryMutAct_9fa48('4245')
              ? !!userId || userId.length > 0
              : stryMutAct_9fa48('4244')
                ? true
                : (stryCov_9fa48('4244', '4245'),
                  (stryMutAct_9fa48('4246')
                    ? !userId
                    : (stryCov_9fa48('4246'),
                      !(stryMutAct_9fa48('4247') ? userId : (stryCov_9fa48('4247'), !userId)))) &&
                    (stryMutAct_9fa48('4250')
                      ? userId.length <= 0
                      : stryMutAct_9fa48('4249')
                        ? userId.length >= 0
                        : stryMutAct_9fa48('4248')
                          ? true
                          : (stryCov_9fa48('4248', '4249', '4250'), userId.length > 0)))) &&
              (stryMutAct_9fa48('4253')
                ? userId.length > 64
                : stryMutAct_9fa48('4252')
                  ? userId.length < 64
                  : stryMutAct_9fa48('4251')
                    ? true
                    : (stryCov_9fa48('4251', '4252', '4253'), userId.length <= 64)));
  }
}
export function isNonEmptyString(value: unknown): value is string {
  if (stryMutAct_9fa48('4254')) {
    {
    }
  } else {
    stryCov_9fa48('4254');
    return stryMutAct_9fa48('4257')
      ? typeof value === 'string' || value.trim().length > 0
      : stryMutAct_9fa48('4256')
        ? false
        : stryMutAct_9fa48('4255')
          ? true
          : (stryCov_9fa48('4255', '4256', '4257'),
            (stryMutAct_9fa48('4259')
              ? typeof value !== 'string'
              : stryMutAct_9fa48('4258')
                ? true
                : (stryCov_9fa48('4258', '4259'),
                  typeof value ===
                    (stryMutAct_9fa48('4260') ? '' : (stryCov_9fa48('4260'), 'string')))) &&
              (stryMutAct_9fa48('4263')
                ? value.trim().length <= 0
                : stryMutAct_9fa48('4262')
                  ? value.trim().length >= 0
                  : stryMutAct_9fa48('4261')
                    ? true
                    : (stryCov_9fa48('4261', '4262', '4263'),
                      (stryMutAct_9fa48('4264')
                        ? value.length
                        : (stryCov_9fa48('4264'), value.trim().length)) > 0)));
  }
}
export function isPositiveInteger(value: unknown): value is number {
  if (stryMutAct_9fa48('4265')) {
    {
    }
  } else {
    stryCov_9fa48('4265');
    return stryMutAct_9fa48('4268')
      ? (typeof value === 'number' && Number.isInteger(value)) || value > 0
      : stryMutAct_9fa48('4267')
        ? false
        : stryMutAct_9fa48('4266')
          ? true
          : (stryCov_9fa48('4266', '4267', '4268'),
            (stryMutAct_9fa48('4270')
              ? typeof value === 'number' || Number.isInteger(value)
              : stryMutAct_9fa48('4269')
                ? true
                : (stryCov_9fa48('4269', '4270'),
                  (stryMutAct_9fa48('4272')
                    ? typeof value !== 'number'
                    : stryMutAct_9fa48('4271')
                      ? true
                      : (stryCov_9fa48('4271', '4272'),
                        typeof value ===
                          (stryMutAct_9fa48('4273') ? '' : (stryCov_9fa48('4273'), 'number')))) &&
                    Number.isInteger(value))) &&
              (stryMutAct_9fa48('4276')
                ? value <= 0
                : stryMutAct_9fa48('4275')
                  ? value >= 0
                  : stryMutAct_9fa48('4274')
                    ? true
                    : (stryCov_9fa48('4274', '4275', '4276'), value > 0)));
  }
}
