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
  format = stryMutAct_9fa48('790') ? '' : (stryCov_9fa48('790'), 'YYYY-MM-DD')
): string {
  if (stryMutAct_9fa48('791')) {
    {
    }
  } else {
    stryCov_9fa48('791');
    const d = (
      stryMutAct_9fa48('794')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('793')
          ? false
          : stryMutAct_9fa48('792')
            ? true
            : (stryCov_9fa48('792', '793', '794'),
              typeof date === (stryMutAct_9fa48('795') ? '' : (stryCov_9fa48('795'), 'string')))
    )
      ? new Date(date)
      : date;
    const year = d.getFullYear();
    const month = String(
      stryMutAct_9fa48('796') ? d.getMonth() - 1 : (stryCov_9fa48('796'), d.getMonth() + 1)
    ).padStart(2, stryMutAct_9fa48('797') ? '' : (stryCov_9fa48('797'), '0'));
    const day = String(d.getDate()).padStart(
      2,
      stryMutAct_9fa48('798') ? '' : (stryCov_9fa48('798'), '0')
    );
    const hours = String(d.getHours()).padStart(
      2,
      stryMutAct_9fa48('799') ? '' : (stryCov_9fa48('799'), '0')
    );
    const minutes = String(d.getMinutes()).padStart(
      2,
      stryMutAct_9fa48('800') ? '' : (stryCov_9fa48('800'), '0')
    );
    const seconds = String(d.getSeconds()).padStart(
      2,
      stryMutAct_9fa48('801') ? '' : (stryCov_9fa48('801'), '0')
    );
    return format
      .replace(stryMutAct_9fa48('802') ? '' : (stryCov_9fa48('802'), 'YYYY'), String(year))
      .replace(stryMutAct_9fa48('803') ? '' : (stryCov_9fa48('803'), 'MM'), month)
      .replace(stryMutAct_9fa48('804') ? '' : (stryCov_9fa48('804'), 'DD'), day)
      .replace(stryMutAct_9fa48('805') ? '' : (stryCov_9fa48('805'), 'HH'), hours)
      .replace(stryMutAct_9fa48('806') ? '' : (stryCov_9fa48('806'), 'mm'), minutes)
      .replace(stryMutAct_9fa48('807') ? '' : (stryCov_9fa48('807'), 'ss'), seconds);
  }
}
export function formatRelativeTime(date: Date | string): string {
  if (stryMutAct_9fa48('808')) {
    {
    }
  } else {
    stryCov_9fa48('808');
    const d = (
      stryMutAct_9fa48('811')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('810')
          ? false
          : stryMutAct_9fa48('809')
            ? true
            : (stryCov_9fa48('809', '810', '811'),
              typeof date === (stryMutAct_9fa48('812') ? '' : (stryCov_9fa48('812'), 'string')))
    )
      ? new Date(date)
      : date;
    const now = new Date();
    const diffMs = stryMutAct_9fa48('813')
      ? now.getTime() + d.getTime()
      : (stryCov_9fa48('813'), now.getTime() - d.getTime());
    const diffSec = Math.floor(
      stryMutAct_9fa48('814') ? diffMs * 1000 : (stryCov_9fa48('814'), diffMs / 1000)
    );
    const diffMin = Math.floor(
      stryMutAct_9fa48('815') ? diffSec * 60 : (stryCov_9fa48('815'), diffSec / 60)
    );
    const diffHour = Math.floor(
      stryMutAct_9fa48('816') ? diffMin * 60 : (stryCov_9fa48('816'), diffMin / 60)
    );
    const diffDay = Math.floor(
      stryMutAct_9fa48('817') ? diffHour * 24 : (stryCov_9fa48('817'), diffHour / 24)
    );
    if (
      stryMutAct_9fa48('821')
        ? diffSec >= 60
        : stryMutAct_9fa48('820')
          ? diffSec <= 60
          : stryMutAct_9fa48('819')
            ? false
            : stryMutAct_9fa48('818')
              ? true
              : (stryCov_9fa48('818', '819', '820', '821'), diffSec < 60)
    ) {
      if (stryMutAct_9fa48('822')) {
        {
        }
      } else {
        stryCov_9fa48('822');
        return stryMutAct_9fa48('823') ? `` : (stryCov_9fa48('823'), `${diffSec}秒前`);
      }
    }
    if (
      stryMutAct_9fa48('827')
        ? diffMin >= 60
        : stryMutAct_9fa48('826')
          ? diffMin <= 60
          : stryMutAct_9fa48('825')
            ? false
            : stryMutAct_9fa48('824')
              ? true
              : (stryCov_9fa48('824', '825', '826', '827'), diffMin < 60)
    ) {
      if (stryMutAct_9fa48('828')) {
        {
        }
      } else {
        stryCov_9fa48('828');
        return stryMutAct_9fa48('829') ? `` : (stryCov_9fa48('829'), `${diffMin}分钟前`);
      }
    }
    if (
      stryMutAct_9fa48('833')
        ? diffHour >= 24
        : stryMutAct_9fa48('832')
          ? diffHour <= 24
          : stryMutAct_9fa48('831')
            ? false
            : stryMutAct_9fa48('830')
              ? true
              : (stryCov_9fa48('830', '831', '832', '833'), diffHour < 24)
    ) {
      if (stryMutAct_9fa48('834')) {
        {
        }
      } else {
        stryCov_9fa48('834');
        return stryMutAct_9fa48('835') ? `` : (stryCov_9fa48('835'), `${diffHour}小时前`);
      }
    }
    if (
      stryMutAct_9fa48('839')
        ? diffDay >= 7
        : stryMutAct_9fa48('838')
          ? diffDay <= 7
          : stryMutAct_9fa48('837')
            ? false
            : stryMutAct_9fa48('836')
              ? true
              : (stryCov_9fa48('836', '837', '838', '839'), diffDay < 7)
    ) {
      if (stryMutAct_9fa48('840')) {
        {
        }
      } else {
        stryCov_9fa48('840');
        return stryMutAct_9fa48('841') ? `` : (stryCov_9fa48('841'), `${diffDay}天前`);
      }
    }
    return formatDate(d, stryMutAct_9fa48('842') ? '' : (stryCov_9fa48('842'), 'YYYY-MM-DD'));
  }
}
export function parseDate(dateStr: string): Date {
  if (stryMutAct_9fa48('843')) {
    {
    }
  } else {
    stryCov_9fa48('843');
    return new Date(dateStr);
  }
}
export function isToday(date: Date | string): boolean {
  if (stryMutAct_9fa48('844')) {
    {
    }
  } else {
    stryCov_9fa48('844');
    const d = (
      stryMutAct_9fa48('847')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('846')
          ? false
          : stryMutAct_9fa48('845')
            ? true
            : (stryCov_9fa48('845', '846', '847'),
              typeof date === (stryMutAct_9fa48('848') ? '' : (stryCov_9fa48('848'), 'string')))
    )
      ? new Date(date)
      : date;
    const today = new Date();
    return stryMutAct_9fa48('851')
      ? (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) ||
          d.getFullYear() === today.getFullYear()
      : stryMutAct_9fa48('850')
        ? false
        : stryMutAct_9fa48('849')
          ? true
          : (stryCov_9fa48('849', '850', '851'),
            (stryMutAct_9fa48('853')
              ? d.getDate() === today.getDate() || d.getMonth() === today.getMonth()
              : stryMutAct_9fa48('852')
                ? true
                : (stryCov_9fa48('852', '853'),
                  (stryMutAct_9fa48('855')
                    ? d.getDate() !== today.getDate()
                    : stryMutAct_9fa48('854')
                      ? true
                      : (stryCov_9fa48('854', '855'), d.getDate() === today.getDate())) &&
                    (stryMutAct_9fa48('857')
                      ? d.getMonth() !== today.getMonth()
                      : stryMutAct_9fa48('856')
                        ? true
                        : (stryCov_9fa48('856', '857'), d.getMonth() === today.getMonth())))) &&
              (stryMutAct_9fa48('859')
                ? d.getFullYear() !== today.getFullYear()
                : stryMutAct_9fa48('858')
                  ? true
                  : (stryCov_9fa48('858', '859'), d.getFullYear() === today.getFullYear())));
  }
}
export function addDays(date: Date, days: number): Date {
  if (stryMutAct_9fa48('860')) {
    {
    }
  } else {
    stryCov_9fa48('860');
    const result = new Date(date);
    stryMutAct_9fa48('861')
      ? result.setTime(result.getDate() + days)
      : (stryCov_9fa48('861'),
        result.setDate(
          stryMutAct_9fa48('862')
            ? result.getDate() - days
            : (stryCov_9fa48('862'), result.getDate() + days)
        ));
    return result;
  }
}
