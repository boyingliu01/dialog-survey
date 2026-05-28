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
import { InterviewEntity, InterviewStatus } from '../entities/interview.entity.js';
export class InterviewDomainService {
  canStartFollowup(interview: InterviewEntity): boolean {
    if (stryMutAct_9fa48('1294')) {
      {
      }
    } else {
      stryCov_9fa48('1294');
      return stryMutAct_9fa48('1297')
        ? interview.followupCount < interview.maxFollowups ||
            interview.status === InterviewStatus.ACTIVE
        : stryMutAct_9fa48('1296')
          ? false
          : stryMutAct_9fa48('1295')
            ? true
            : (stryCov_9fa48('1295', '1296', '1297'),
              (stryMutAct_9fa48('1300')
                ? interview.followupCount >= interview.maxFollowups
                : stryMutAct_9fa48('1299')
                  ? interview.followupCount <= interview.maxFollowups
                  : stryMutAct_9fa48('1298')
                    ? true
                    : (stryCov_9fa48('1298', '1299', '1300'),
                      interview.followupCount < interview.maxFollowups)) &&
                (stryMutAct_9fa48('1302')
                  ? interview.status !== InterviewStatus.ACTIVE
                  : stryMutAct_9fa48('1301')
                    ? true
                    : (stryCov_9fa48('1301', '1302'),
                      interview.status === InterviewStatus.ACTIVE)));
    }
  }
  shouldGenerateFollowup(response: string): boolean {
    if (stryMutAct_9fa48('1303')) {
      {
      }
    } else {
      stryCov_9fa48('1303');
      const vagueIndicators = stryMutAct_9fa48('1304')
        ? []
        : (stryCov_9fa48('1304'),
          [
            stryMutAct_9fa48('1305') ? '' : (stryCov_9fa48('1305'), 'maybe'),
            stryMutAct_9fa48('1306') ? '' : (stryCov_9fa48('1306'), 'perhaps'),
            stryMutAct_9fa48('1307') ? '' : (stryCov_9fa48('1307'), 'not sure'),
            stryMutAct_9fa48('1308') ? '' : (stryCov_9fa48('1308'), 'could be'),
            stryMutAct_9fa48('1309') ? '' : (stryCov_9fa48('1309'), 'might'),
            stryMutAct_9fa48('1310') ? '' : (stryCov_9fa48('1310'), 'possibly'),
            stryMutAct_9fa48('1311') ? '' : (stryCov_9fa48('1311'), '一般'),
            stryMutAct_9fa48('1312') ? '' : (stryCov_9fa48('1312'), '可能'),
            stryMutAct_9fa48('1313') ? '' : (stryCov_9fa48('1313'), '也许'),
            stryMutAct_9fa48('1314') ? '' : (stryCov_9fa48('1314'), '不太确定'),
          ]);
      const lowerResponse = stryMutAct_9fa48('1315')
        ? response.toUpperCase()
        : (stryCov_9fa48('1315'), response.toLowerCase());
      return stryMutAct_9fa48('1316')
        ? vagueIndicators.every((indicator) => lowerResponse.includes(indicator))
        : (stryCov_9fa48('1316'),
          vagueIndicators.some(
            stryMutAct_9fa48('1317')
              ? () => undefined
              : (stryCov_9fa48('1317'), (indicator) => lowerResponse.includes(indicator))
          ));
    }
  }
  canMoveToNextQuestion(interview: InterviewEntity): boolean {
    if (stryMutAct_9fa48('1318')) {
      {
      }
    } else {
      stryCov_9fa48('1318');
      return stryMutAct_9fa48('1321')
        ? interview.status !== InterviewStatus.ACTIVE
        : stryMutAct_9fa48('1320')
          ? false
          : stryMutAct_9fa48('1319')
            ? true
            : (stryCov_9fa48('1319', '1320', '1321'), interview.status === InterviewStatus.ACTIVE);
    }
  }
  isInterviewComplete(interview: InterviewEntity): boolean {
    if (stryMutAct_9fa48('1322')) {
      {
      }
    } else {
      stryCov_9fa48('1322');
      return stryMutAct_9fa48('1325')
        ? interview.status !== InterviewStatus.COMPLETED
        : stryMutAct_9fa48('1324')
          ? false
          : stryMutAct_9fa48('1323')
            ? true
            : (stryCov_9fa48('1323', '1324', '1325'),
              interview.status === InterviewStatus.COMPLETED);
    }
  }
}
