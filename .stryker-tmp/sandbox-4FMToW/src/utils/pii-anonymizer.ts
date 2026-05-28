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
const PHONE_RE = stryMutAct_9fa48('817')
  ? /\b1[3-9]\D{9}\b/g
  : stryMutAct_9fa48('816')
    ? /\b1[3-9]\d\b/g
    : stryMutAct_9fa48('815')
      ? /\b1[^3-9]\d{9}\b/g
      : (stryCov_9fa48('815', '816', '817'), /\b1[3-9]\d{9}\b/g);
const EMAIL_RE = stryMutAct_9fa48('823')
  ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[^a-zA-Z]{2,}/g
  : stryMutAct_9fa48('822')
    ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]/g
    : stryMutAct_9fa48('821')
      ? /[a-zA-Z0-9._%+-]+@[^a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      : stryMutAct_9fa48('820')
        ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]\.[a-zA-Z]{2,}/g
        : stryMutAct_9fa48('819')
          ? /[^a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
          : stryMutAct_9fa48('818')
            ? /[a-zA-Z0-9._%+-]@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
            : (stryCov_9fa48('818', '819', '820', '821', '822', '823'),
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
const CHINESE_NAME_RE = stryMutAct_9fa48('825')
  ? /[^\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g
  : stryMutAct_9fa48('824')
    ? /[\u4e00-\u9fa5](?:说|的|表示|反映|提到|认为|反馈|也同意)/g
    : (stryCov_9fa48('824', '825'),
      /[\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g);
export function anonymizePII(text: string): string {
  if (stryMutAct_9fa48('826')) {
    {
    }
  } else {
    stryCov_9fa48('826');
    if (
      stryMutAct_9fa48('829')
        ? false
        : stryMutAct_9fa48('828')
          ? true
          : stryMutAct_9fa48('827')
            ? text
            : (stryCov_9fa48('827', '828', '829'), !text)
    )
      return stryMutAct_9fa48('830') ? 'Stryker was here!' : (stryCov_9fa48('830'), '');
    let result = text;
    result = result.replace(
      PHONE_RE,
      stryMutAct_9fa48('831')
        ? () => undefined
        : (stryCov_9fa48('831'),
          (m) =>
            stryMutAct_9fa48('832')
              ? ``
              : (stryCov_9fa48('832'),
                `${stryMutAct_9fa48('833') ? m : (stryCov_9fa48('833'), m.slice(0, 3))}****${stryMutAct_9fa48('834') ? m : (stryCov_9fa48('834'), m.slice(7))}`))
    );
    result = result.replace(
      EMAIL_RE,
      stryMutAct_9fa48('835') ? '' : (stryCov_9fa48('835'), '[邮箱]')
    );
    result = result.replace(
      CHINESE_NAME_RE,
      stryMutAct_9fa48('836') ? '' : (stryCov_9fa48('836'), '[匿名用户]')
    );
    return result;
  }
}
