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
import crypto from 'node:crypto';
const TIMESTAMP_TOLERANCE = 300000;
export function verifySignature(timestamp: number, secret: string, signature: string): boolean {
  if (stryMutAct_9fa48('1444')) {
    {
    }
  } else {
    stryCov_9fa48('1444');
    if (
      stryMutAct_9fa48('1447')
        ? (!timestamp || !secret) && !signature
        : stryMutAct_9fa48('1446')
          ? false
          : stryMutAct_9fa48('1445')
            ? true
            : (stryCov_9fa48('1445', '1446', '1447'),
              (stryMutAct_9fa48('1449')
                ? !timestamp && !secret
                : stryMutAct_9fa48('1448')
                  ? false
                  : (stryCov_9fa48('1448', '1449'),
                    (stryMutAct_9fa48('1450') ? timestamp : (stryCov_9fa48('1450'), !timestamp)) ||
                      (stryMutAct_9fa48('1451') ? secret : (stryCov_9fa48('1451'), !secret)))) ||
                (stryMutAct_9fa48('1452') ? signature : (stryCov_9fa48('1452'), !signature)))
    ) {
      if (stryMutAct_9fa48('1453')) {
        {
        }
      } else {
        stryCov_9fa48('1453');
        return stryMutAct_9fa48('1454') ? true : (stryCov_9fa48('1454'), false);
      }
    }
    if (
      stryMutAct_9fa48('1457')
        ? false
        : stryMutAct_9fa48('1456')
          ? true
          : stryMutAct_9fa48('1455')
            ? verifyTimestamp(timestamp)
            : (stryCov_9fa48('1455', '1456', '1457'), !verifyTimestamp(timestamp))
    ) {
      if (stryMutAct_9fa48('1458')) {
        {
        }
      } else {
        stryCov_9fa48('1458');
        return stryMutAct_9fa48('1459') ? true : (stryCov_9fa48('1459'), false);
      }
    }
    const stringToSign = stryMutAct_9fa48('1460')
      ? ``
      : (stryCov_9fa48('1460'), `${timestamp}\n${secret}`);
    const expectedSignature = crypto
      .createHmac(stryMutAct_9fa48('1461') ? '' : (stryCov_9fa48('1461'), 'sha256'), secret)
      .update(stringToSign)
      .digest(stryMutAct_9fa48('1462') ? '' : (stryCov_9fa48('1462'), 'base64'));
    return stryMutAct_9fa48('1465')
      ? expectedSignature !== signature
      : stryMutAct_9fa48('1464')
        ? false
        : stryMutAct_9fa48('1463')
          ? true
          : (stryCov_9fa48('1463', '1464', '1465'), expectedSignature === signature);
  }
}
export function verifyTimestamp(timestamp: number): boolean {
  if (stryMutAct_9fa48('1466')) {
    {
    }
  } else {
    stryCov_9fa48('1466');
    if (
      stryMutAct_9fa48('1469')
        ? false
        : stryMutAct_9fa48('1468')
          ? true
          : stryMutAct_9fa48('1467')
            ? timestamp
            : (stryCov_9fa48('1467', '1468', '1469'), !timestamp)
    ) {
      if (stryMutAct_9fa48('1470')) {
        {
        }
      } else {
        stryCov_9fa48('1470');
        return stryMutAct_9fa48('1471') ? true : (stryCov_9fa48('1471'), false);
      }
    }
    const now = Date.now();
    const diff = Math.abs(
      stryMutAct_9fa48('1472') ? now + timestamp : (stryCov_9fa48('1472'), now - timestamp)
    );
    return stryMutAct_9fa48('1476')
      ? diff > TIMESTAMP_TOLERANCE
      : stryMutAct_9fa48('1475')
        ? diff < TIMESTAMP_TOLERANCE
        : stryMutAct_9fa48('1474')
          ? false
          : stryMutAct_9fa48('1473')
            ? true
            : (stryCov_9fa48('1473', '1474', '1475', '1476'), diff <= TIMESTAMP_TOLERANCE);
  }
}
export function generateSignature(timestamp: number, secret: string): string {
  if (stryMutAct_9fa48('1477')) {
    {
    }
  } else {
    stryCov_9fa48('1477');
    const stringToSign = stryMutAct_9fa48('1478')
      ? ``
      : (stryCov_9fa48('1478'), `${timestamp}\n${secret}`);
    return crypto
      .createHmac(stryMutAct_9fa48('1479') ? '' : (stryCov_9fa48('1479'), 'sha256'), secret)
      .update(stringToSign)
      .digest(stryMutAct_9fa48('1480') ? '' : (stryCov_9fa48('1480'), 'base64'));
  }
}
