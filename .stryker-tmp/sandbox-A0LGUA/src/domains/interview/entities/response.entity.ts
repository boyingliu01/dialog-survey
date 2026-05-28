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
export interface ResponseEntity {
  id: string;
  interviewId: string;
  questionId: string;
  content: string;
  isFollowup: boolean;
  followupDepth: number;
  createdAt: Date;
}
export function createResponse(params: {
  interviewId: string;
  questionId: string;
  content: string;
  isFollowup?: boolean;
  followupDepth?: number;
}): ResponseEntity {
  if (stryMutAct_9fa48('1285')) {
    {
    }
  } else {
    stryCov_9fa48('1285');
    return stryMutAct_9fa48('1286')
      ? {}
      : (stryCov_9fa48('1286'),
        {
          id: crypto.randomUUID(),
          interviewId: params.interviewId,
          questionId: params.questionId,
          content: params.content,
          isFollowup: stryMutAct_9fa48('1289')
            ? params.isFollowup && false
            : stryMutAct_9fa48('1288')
              ? false
              : stryMutAct_9fa48('1287')
                ? true
                : (stryCov_9fa48('1287', '1288', '1289'),
                  params.isFollowup ||
                    (stryMutAct_9fa48('1290') ? true : (stryCov_9fa48('1290'), false))),
          followupDepth: stryMutAct_9fa48('1293')
            ? params.followupDepth && 0
            : stryMutAct_9fa48('1292')
              ? false
              : stryMutAct_9fa48('1291')
                ? true
                : (stryCov_9fa48('1291', '1292', '1293'), params.followupDepth || 0),
          createdAt: new Date(),
        });
  }
}
