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
const PHONE_RE = stryMutAct_9fa48('4031')
  ? /\b1[3-9]\D{9}\b/g
  : stryMutAct_9fa48('4030')
    ? /\b1[3-9]\d\b/g
    : stryMutAct_9fa48('4029')
      ? /\b1[^3-9]\d{9}\b/g
      : (stryCov_9fa48('4029', '4030', '4031'), /\b1[3-9]\d{9}\b/g);
const EMAIL_RE = stryMutAct_9fa48('4037')
  ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[^a-zA-Z]{2,}/g
  : stryMutAct_9fa48('4036')
    ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]/g
    : stryMutAct_9fa48('4035')
      ? /[a-zA-Z0-9._%+-]+@[^a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      : stryMutAct_9fa48('4034')
        ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]\.[a-zA-Z]{2,}/g
        : stryMutAct_9fa48('4033')
          ? /[^a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
          : stryMutAct_9fa48('4032')
            ? /[a-zA-Z0-9._%+-]@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
            : (stryCov_9fa48('4032', '4033', '4034', '4035', '4036', '4037'),
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
const CHINESE_NAME_RE = stryMutAct_9fa48('4039')
  ? /[^\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g
  : stryMutAct_9fa48('4038')
    ? /[\u4e00-\u9fa5](?:说|的|表示|反映|提到|认为|反馈|也同意)/g
    : (stryCov_9fa48('4038', '4039'),
      /[\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g);
export function anonymizePII(text: string): string {
  if (stryMutAct_9fa48('4040')) {
    {
    }
  } else {
    stryCov_9fa48('4040');
    if (
      stryMutAct_9fa48('4043')
        ? false
        : stryMutAct_9fa48('4042')
          ? true
          : stryMutAct_9fa48('4041')
            ? text
            : (stryCov_9fa48('4041', '4042', '4043'), !text)
    )
      return stryMutAct_9fa48('4044') ? 'Stryker was here!' : (stryCov_9fa48('4044'), '');
    let result = text;
    result = result.replace(
      PHONE_RE,
      stryMutAct_9fa48('4045')
        ? () => undefined
        : (stryCov_9fa48('4045'),
          (m) =>
            stryMutAct_9fa48('4046')
              ? ``
              : (stryCov_9fa48('4046'),
                `${stryMutAct_9fa48('4047') ? m : (stryCov_9fa48('4047'), m.slice(0, 3))}****${stryMutAct_9fa48('4048') ? m : (stryCov_9fa48('4048'), m.slice(7))}`))
    );
    result = result.replace(
      EMAIL_RE,
      stryMutAct_9fa48('4049') ? '' : (stryCov_9fa48('4049'), '[邮箱]')
    );
    result = result.replace(
      CHINESE_NAME_RE,
      stryMutAct_9fa48('4050') ? '' : (stryCov_9fa48('4050'), '[匿名用户]')
    );
    return result;
  }
}
