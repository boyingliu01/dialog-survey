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
export function formatDate(
  date: Date | string,
  format = stryMutAct_9fa48('317') ? '' : (stryCov_9fa48('317'), 'YYYY-MM-DD')
): string {
  if (stryMutAct_9fa48('318')) {
    {
    }
  } else {
    stryCov_9fa48('318');
    const d = (
      stryMutAct_9fa48('321')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('320')
          ? false
          : stryMutAct_9fa48('319')
            ? true
            : (stryCov_9fa48('319', '320', '321'),
              typeof date === (stryMutAct_9fa48('322') ? '' : (stryCov_9fa48('322'), 'string')))
    )
      ? new Date(date)
      : date;
    const year = d.getFullYear();
    const month = String(
      stryMutAct_9fa48('323') ? d.getMonth() - 1 : (stryCov_9fa48('323'), d.getMonth() + 1)
    ).padStart(2, stryMutAct_9fa48('324') ? '' : (stryCov_9fa48('324'), '0'));
    const day = String(d.getDate()).padStart(
      2,
      stryMutAct_9fa48('325') ? '' : (stryCov_9fa48('325'), '0')
    );
    const hours = String(d.getHours()).padStart(
      2,
      stryMutAct_9fa48('326') ? '' : (stryCov_9fa48('326'), '0')
    );
    const minutes = String(d.getMinutes()).padStart(
      2,
      stryMutAct_9fa48('327') ? '' : (stryCov_9fa48('327'), '0')
    );
    const seconds = String(d.getSeconds()).padStart(
      2,
      stryMutAct_9fa48('328') ? '' : (stryCov_9fa48('328'), '0')
    );
    return format
      .replace(stryMutAct_9fa48('329') ? '' : (stryCov_9fa48('329'), 'YYYY'), String(year))
      .replace(stryMutAct_9fa48('330') ? '' : (stryCov_9fa48('330'), 'MM'), month)
      .replace(stryMutAct_9fa48('331') ? '' : (stryCov_9fa48('331'), 'DD'), day)
      .replace(stryMutAct_9fa48('332') ? '' : (stryCov_9fa48('332'), 'HH'), hours)
      .replace(stryMutAct_9fa48('333') ? '' : (stryCov_9fa48('333'), 'mm'), minutes)
      .replace(stryMutAct_9fa48('334') ? '' : (stryCov_9fa48('334'), 'ss'), seconds);
  }
}
export function formatRelativeTime(date: Date | string): string {
  if (stryMutAct_9fa48('335')) {
    {
    }
  } else {
    stryCov_9fa48('335');
    const d = (
      stryMutAct_9fa48('338')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('337')
          ? false
          : stryMutAct_9fa48('336')
            ? true
            : (stryCov_9fa48('336', '337', '338'),
              typeof date === (stryMutAct_9fa48('339') ? '' : (stryCov_9fa48('339'), 'string')))
    )
      ? new Date(date)
      : date;
    const now = new Date();
    const diffMs = stryMutAct_9fa48('340')
      ? now.getTime() + d.getTime()
      : (stryCov_9fa48('340'), now.getTime() - d.getTime());
    const diffSec = Math.floor(
      stryMutAct_9fa48('341') ? diffMs * 1000 : (stryCov_9fa48('341'), diffMs / 1000)
    );
    const diffMin = Math.floor(
      stryMutAct_9fa48('342') ? diffSec * 60 : (stryCov_9fa48('342'), diffSec / 60)
    );
    const diffHour = Math.floor(
      stryMutAct_9fa48('343') ? diffMin * 60 : (stryCov_9fa48('343'), diffMin / 60)
    );
    const diffDay = Math.floor(
      stryMutAct_9fa48('344') ? diffHour * 24 : (stryCov_9fa48('344'), diffHour / 24)
    );
    if (
      stryMutAct_9fa48('348')
        ? diffSec >= 60
        : stryMutAct_9fa48('347')
          ? diffSec <= 60
          : stryMutAct_9fa48('346')
            ? false
            : stryMutAct_9fa48('345')
              ? true
              : (stryCov_9fa48('345', '346', '347', '348'), diffSec < 60)
    ) {
      if (stryMutAct_9fa48('349')) {
        {
        }
      } else {
        stryCov_9fa48('349');
        return stryMutAct_9fa48('350') ? `` : (stryCov_9fa48('350'), `${diffSec}秒前`);
      }
    }
    if (
      stryMutAct_9fa48('354')
        ? diffMin >= 60
        : stryMutAct_9fa48('353')
          ? diffMin <= 60
          : stryMutAct_9fa48('352')
            ? false
            : stryMutAct_9fa48('351')
              ? true
              : (stryCov_9fa48('351', '352', '353', '354'), diffMin < 60)
    ) {
      if (stryMutAct_9fa48('355')) {
        {
        }
      } else {
        stryCov_9fa48('355');
        return stryMutAct_9fa48('356') ? `` : (stryCov_9fa48('356'), `${diffMin}分钟前`);
      }
    }
    if (
      stryMutAct_9fa48('360')
        ? diffHour >= 24
        : stryMutAct_9fa48('359')
          ? diffHour <= 24
          : stryMutAct_9fa48('358')
            ? false
            : stryMutAct_9fa48('357')
              ? true
              : (stryCov_9fa48('357', '358', '359', '360'), diffHour < 24)
    ) {
      if (stryMutAct_9fa48('361')) {
        {
        }
      } else {
        stryCov_9fa48('361');
        return stryMutAct_9fa48('362') ? `` : (stryCov_9fa48('362'), `${diffHour}小时前`);
      }
    }
    if (
      stryMutAct_9fa48('366')
        ? diffDay >= 7
        : stryMutAct_9fa48('365')
          ? diffDay <= 7
          : stryMutAct_9fa48('364')
            ? false
            : stryMutAct_9fa48('363')
              ? true
              : (stryCov_9fa48('363', '364', '365', '366'), diffDay < 7)
    ) {
      if (stryMutAct_9fa48('367')) {
        {
        }
      } else {
        stryCov_9fa48('367');
        return stryMutAct_9fa48('368') ? `` : (stryCov_9fa48('368'), `${diffDay}天前`);
      }
    }
    return formatDate(d, stryMutAct_9fa48('369') ? '' : (stryCov_9fa48('369'), 'YYYY-MM-DD'));
  }
}
export function parseDate(dateStr: string): Date {
  if (stryMutAct_9fa48('370')) {
    {
    }
  } else {
    stryCov_9fa48('370');
    return new Date(dateStr);
  }
}
export function isToday(date: Date | string): boolean {
  if (stryMutAct_9fa48('371')) {
    {
    }
  } else {
    stryCov_9fa48('371');
    const d = (
      stryMutAct_9fa48('374')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('373')
          ? false
          : stryMutAct_9fa48('372')
            ? true
            : (stryCov_9fa48('372', '373', '374'),
              typeof date === (stryMutAct_9fa48('375') ? '' : (stryCov_9fa48('375'), 'string')))
    )
      ? new Date(date)
      : date;
    const today = new Date();
    return stryMutAct_9fa48('378')
      ? (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) ||
          d.getFullYear() === today.getFullYear()
      : stryMutAct_9fa48('377')
        ? false
        : stryMutAct_9fa48('376')
          ? true
          : (stryCov_9fa48('376', '377', '378'),
            (stryMutAct_9fa48('380')
              ? d.getDate() === today.getDate() || d.getMonth() === today.getMonth()
              : stryMutAct_9fa48('379')
                ? true
                : (stryCov_9fa48('379', '380'),
                  (stryMutAct_9fa48('382')
                    ? d.getDate() !== today.getDate()
                    : stryMutAct_9fa48('381')
                      ? true
                      : (stryCov_9fa48('381', '382'), d.getDate() === today.getDate())) &&
                    (stryMutAct_9fa48('384')
                      ? d.getMonth() !== today.getMonth()
                      : stryMutAct_9fa48('383')
                        ? true
                        : (stryCov_9fa48('383', '384'), d.getMonth() === today.getMonth())))) &&
              (stryMutAct_9fa48('386')
                ? d.getFullYear() !== today.getFullYear()
                : stryMutAct_9fa48('385')
                  ? true
                  : (stryCov_9fa48('385', '386'), d.getFullYear() === today.getFullYear())));
  }
}
export function addDays(date: Date, days: number): Date {
  if (stryMutAct_9fa48('387')) {
    {
    }
  } else {
    stryCov_9fa48('387');
    const result = new Date(date);
    stryMutAct_9fa48('388')
      ? result.setTime(result.getDate() + days)
      : (stryCov_9fa48('388'),
        result.setDate(
          stryMutAct_9fa48('389')
            ? result.getDate() - days
            : (stryCov_9fa48('389'), result.getDate() + days)
        ));
    return result;
  }
}
