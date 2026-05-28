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
const PHONE_RE = stryMutAct_9fa48('910')
  ? /\b1[3-9]\D{9}\b/g
  : stryMutAct_9fa48('909')
    ? /\b1[3-9]\d\b/g
    : stryMutAct_9fa48('908')
      ? /\b1[^3-9]\d{9}\b/g
      : (stryCov_9fa48('908', '909', '910'), /\b1[3-9]\d{9}\b/g);
const EMAIL_RE = stryMutAct_9fa48('916')
  ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[^a-zA-Z]{2,}/g
  : stryMutAct_9fa48('915')
    ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]/g
    : stryMutAct_9fa48('914')
      ? /[a-zA-Z0-9._%+-]+@[^a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      : stryMutAct_9fa48('913')
        ? /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]\.[a-zA-Z]{2,}/g
        : stryMutAct_9fa48('912')
          ? /[^a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
          : stryMutAct_9fa48('911')
            ? /[a-zA-Z0-9._%+-]@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
            : (stryCov_9fa48('911', '912', '913', '914', '915', '916'),
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
const CHINESE_NAME_RE = stryMutAct_9fa48('918')
  ? /[^\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g
  : stryMutAct_9fa48('917')
    ? /[\u4e00-\u9fa5](?:说|的|表示|反映|提到|认为|反馈|也同意)/g
    : (stryCov_9fa48('917', '918'),
      /[\u4e00-\u9fa5]{2,4}(?:说|的|表示|反映|提到|认为|反馈|也同意)/g);
export function anonymizePII(text: string): string {
  if (stryMutAct_9fa48('919')) {
    {
    }
  } else {
    stryCov_9fa48('919');
    if (
      stryMutAct_9fa48('922')
        ? false
        : stryMutAct_9fa48('921')
          ? true
          : stryMutAct_9fa48('920')
            ? text
            : (stryCov_9fa48('920', '921', '922'), !text)
    )
      return stryMutAct_9fa48('923') ? 'Stryker was here!' : (stryCov_9fa48('923'), '');
    let result = text;
    result = result.replace(
      PHONE_RE,
      stryMutAct_9fa48('924')
        ? () => undefined
        : (stryCov_9fa48('924'),
          (m) =>
            stryMutAct_9fa48('925')
              ? ``
              : (stryCov_9fa48('925'),
                `${stryMutAct_9fa48('926') ? m : (stryCov_9fa48('926'), m.slice(0, 3))}****${stryMutAct_9fa48('927') ? m : (stryCov_9fa48('927'), m.slice(7))}`))
    );
    result = result.replace(
      EMAIL_RE,
      stryMutAct_9fa48('928') ? '' : (stryCov_9fa48('928'), '[邮箱]')
    );
    result = result.replace(
      CHINESE_NAME_RE,
      stryMutAct_9fa48('929') ? '' : (stryCov_9fa48('929'), '[匿名用户]')
    );
    return result;
  }
}
