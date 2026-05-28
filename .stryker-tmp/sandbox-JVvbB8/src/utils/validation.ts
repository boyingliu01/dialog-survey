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
  if (stryMutAct_9fa48('1081')) {
    {
    }
  } else {
    stryCov_9fa48('1081');
    const emailRegex = stryMutAct_9fa48('1092')
      ? /^[^\s@]+@[^\s@]+\.[^\S@]+$/
      : stryMutAct_9fa48('1091')
        ? /^[^\s@]+@[^\s@]+\.[\s@]+$/
        : stryMutAct_9fa48('1090')
          ? /^[^\s@]+@[^\s@]+\.[^\s@]$/
          : stryMutAct_9fa48('1089')
            ? /^[^\s@]+@[^\S@]+\.[^\s@]+$/
            : stryMutAct_9fa48('1088')
              ? /^[^\s@]+@[\s@]+\.[^\s@]+$/
              : stryMutAct_9fa48('1087')
                ? /^[^\s@]+@[^\s@]\.[^\s@]+$/
                : stryMutAct_9fa48('1086')
                  ? /^[^\S@]+@[^\s@]+\.[^\s@]+$/
                  : stryMutAct_9fa48('1085')
                    ? /^[\s@]+@[^\s@]+\.[^\s@]+$/
                    : stryMutAct_9fa48('1084')
                      ? /^[^\s@]@[^\s@]+\.[^\s@]+$/
                      : stryMutAct_9fa48('1083')
                        ? /^[^\s@]+@[^\s@]+\.[^\s@]+/
                        : stryMutAct_9fa48('1082')
                          ? /[^\s@]+@[^\s@]+\.[^\s@]+$/
                          : (stryCov_9fa48(
                              '1082',
                              '1083',
                              '1084',
                              '1085',
                              '1086',
                              '1087',
                              '1088',
                              '1089',
                              '1090',
                              '1091',
                              '1092'
                            ),
                            /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return emailRegex.test(email);
  }
}
export function isValidPhone(phone: string): boolean {
  if (stryMutAct_9fa48('1093')) {
    {
    }
  } else {
    stryCov_9fa48('1093');
    const phoneRegex = stryMutAct_9fa48('1098')
      ? /^1[3-9]\D{9}$/
      : stryMutAct_9fa48('1097')
        ? /^1[3-9]\d$/
        : stryMutAct_9fa48('1096')
          ? /^1[^3-9]\d{9}$/
          : stryMutAct_9fa48('1095')
            ? /^1[3-9]\d{9}/
            : stryMutAct_9fa48('1094')
              ? /1[3-9]\d{9}$/
              : (stryCov_9fa48('1094', '1095', '1096', '1097', '1098'), /^1[3-9]\d{9}$/);
    return phoneRegex.test(phone);
  }
}
export function isValidUrl(url: string): boolean {
  if (stryMutAct_9fa48('1099')) {
    {
    }
  } else {
    stryCov_9fa48('1099');
    try {
      if (stryMutAct_9fa48('1100')) {
        {
        }
      } else {
        stryCov_9fa48('1100');
        new URL(url);
        return stryMutAct_9fa48('1101') ? false : (stryCov_9fa48('1101'), true);
      }
    } catch {
      if (stryMutAct_9fa48('1102')) {
        {
        }
      } else {
        stryCov_9fa48('1102');
        return stryMutAct_9fa48('1103') ? true : (stryCov_9fa48('1103'), false);
      }
    }
  }
}
export function isValidUUID(uuid: string): boolean {
  if (stryMutAct_9fa48('1104')) {
    {
    }
  } else {
    stryCov_9fa48('1104');
    const uuidRegex = stryMutAct_9fa48('1118')
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i
      : stryMutAct_9fa48('1117')
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i
        : stryMutAct_9fa48('1116')
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i
          : stryMutAct_9fa48('1115')
            ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i
            : stryMutAct_9fa48('1114')
              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
              : stryMutAct_9fa48('1113')
                ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                : stryMutAct_9fa48('1112')
                  ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                  : stryMutAct_9fa48('1111')
                    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                    : stryMutAct_9fa48('1110')
                      ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                      : stryMutAct_9fa48('1109')
                        ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                        : stryMutAct_9fa48('1108')
                          ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                          : stryMutAct_9fa48('1107')
                            ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                            : stryMutAct_9fa48('1106')
                              ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
                              : stryMutAct_9fa48('1105')
                                ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                                : (stryCov_9fa48(
                                    '1105',
                                    '1106',
                                    '1107',
                                    '1108',
                                    '1109',
                                    '1110',
                                    '1111',
                                    '1112',
                                    '1113',
                                    '1114',
                                    '1115',
                                    '1116',
                                    '1117',
                                    '1118'
                                  ),
                                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    return uuidRegex.test(uuid);
  }
}
export function isValidDingTalkUserId(userId: string): boolean {
  if (stryMutAct_9fa48('1119')) {
    {
    }
  } else {
    stryCov_9fa48('1119');
    return stryMutAct_9fa48('1122')
      ? (!!userId && userId.length > 0) || userId.length <= 64
      : stryMutAct_9fa48('1121')
        ? false
        : stryMutAct_9fa48('1120')
          ? true
          : (stryCov_9fa48('1120', '1121', '1122'),
            (stryMutAct_9fa48('1124')
              ? !!userId || userId.length > 0
              : stryMutAct_9fa48('1123')
                ? true
                : (stryCov_9fa48('1123', '1124'),
                  (stryMutAct_9fa48('1125')
                    ? !userId
                    : (stryCov_9fa48('1125'),
                      !(stryMutAct_9fa48('1126') ? userId : (stryCov_9fa48('1126'), !userId)))) &&
                    (stryMutAct_9fa48('1129')
                      ? userId.length <= 0
                      : stryMutAct_9fa48('1128')
                        ? userId.length >= 0
                        : stryMutAct_9fa48('1127')
                          ? true
                          : (stryCov_9fa48('1127', '1128', '1129'), userId.length > 0)))) &&
              (stryMutAct_9fa48('1132')
                ? userId.length > 64
                : stryMutAct_9fa48('1131')
                  ? userId.length < 64
                  : stryMutAct_9fa48('1130')
                    ? true
                    : (stryCov_9fa48('1130', '1131', '1132'), userId.length <= 64)));
  }
}
export function isNonEmptyString(value: unknown): value is string {
  if (stryMutAct_9fa48('1133')) {
    {
    }
  } else {
    stryCov_9fa48('1133');
    return stryMutAct_9fa48('1136')
      ? typeof value === 'string' || value.trim().length > 0
      : stryMutAct_9fa48('1135')
        ? false
        : stryMutAct_9fa48('1134')
          ? true
          : (stryCov_9fa48('1134', '1135', '1136'),
            (stryMutAct_9fa48('1138')
              ? typeof value !== 'string'
              : stryMutAct_9fa48('1137')
                ? true
                : (stryCov_9fa48('1137', '1138'),
                  typeof value ===
                    (stryMutAct_9fa48('1139') ? '' : (stryCov_9fa48('1139'), 'string')))) &&
              (stryMutAct_9fa48('1142')
                ? value.trim().length <= 0
                : stryMutAct_9fa48('1141')
                  ? value.trim().length >= 0
                  : stryMutAct_9fa48('1140')
                    ? true
                    : (stryCov_9fa48('1140', '1141', '1142'),
                      (stryMutAct_9fa48('1143')
                        ? value.length
                        : (stryCov_9fa48('1143'), value.trim().length)) > 0)));
  }
}
export function isPositiveInteger(value: unknown): value is number {
  if (stryMutAct_9fa48('1144')) {
    {
    }
  } else {
    stryCov_9fa48('1144');
    return stryMutAct_9fa48('1147')
      ? (typeof value === 'number' && Number.isInteger(value)) || value > 0
      : stryMutAct_9fa48('1146')
        ? false
        : stryMutAct_9fa48('1145')
          ? true
          : (stryCov_9fa48('1145', '1146', '1147'),
            (stryMutAct_9fa48('1149')
              ? typeof value === 'number' || Number.isInteger(value)
              : stryMutAct_9fa48('1148')
                ? true
                : (stryCov_9fa48('1148', '1149'),
                  (stryMutAct_9fa48('1151')
                    ? typeof value !== 'number'
                    : stryMutAct_9fa48('1150')
                      ? true
                      : (stryCov_9fa48('1150', '1151'),
                        typeof value ===
                          (stryMutAct_9fa48('1152') ? '' : (stryCov_9fa48('1152'), 'number')))) &&
                    Number.isInteger(value))) &&
              (stryMutAct_9fa48('1155')
                ? value <= 0
                : stryMutAct_9fa48('1154')
                  ? value >= 0
                  : stryMutAct_9fa48('1153')
                    ? true
                    : (stryCov_9fa48('1153', '1154', '1155'), value > 0)));
  }
}
