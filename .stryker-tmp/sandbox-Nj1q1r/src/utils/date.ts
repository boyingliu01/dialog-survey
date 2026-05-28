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
  format = stryMutAct_9fa48('500') ? '' : (stryCov_9fa48('500'), 'YYYY-MM-DD')
): string {
  if (stryMutAct_9fa48('501')) {
    {
    }
  } else {
    stryCov_9fa48('501');
    const d = (
      stryMutAct_9fa48('504')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('503')
          ? false
          : stryMutAct_9fa48('502')
            ? true
            : (stryCov_9fa48('502', '503', '504'),
              typeof date === (stryMutAct_9fa48('505') ? '' : (stryCov_9fa48('505'), 'string')))
    )
      ? new Date(date)
      : date;
    const year = d.getFullYear();
    const month = String(
      stryMutAct_9fa48('506') ? d.getMonth() - 1 : (stryCov_9fa48('506'), d.getMonth() + 1)
    ).padStart(2, stryMutAct_9fa48('507') ? '' : (stryCov_9fa48('507'), '0'));
    const day = String(d.getDate()).padStart(
      2,
      stryMutAct_9fa48('508') ? '' : (stryCov_9fa48('508'), '0')
    );
    const hours = String(d.getHours()).padStart(
      2,
      stryMutAct_9fa48('509') ? '' : (stryCov_9fa48('509'), '0')
    );
    const minutes = String(d.getMinutes()).padStart(
      2,
      stryMutAct_9fa48('510') ? '' : (stryCov_9fa48('510'), '0')
    );
    const seconds = String(d.getSeconds()).padStart(
      2,
      stryMutAct_9fa48('511') ? '' : (stryCov_9fa48('511'), '0')
    );
    return format
      .replace(stryMutAct_9fa48('512') ? '' : (stryCov_9fa48('512'), 'YYYY'), String(year))
      .replace(stryMutAct_9fa48('513') ? '' : (stryCov_9fa48('513'), 'MM'), month)
      .replace(stryMutAct_9fa48('514') ? '' : (stryCov_9fa48('514'), 'DD'), day)
      .replace(stryMutAct_9fa48('515') ? '' : (stryCov_9fa48('515'), 'HH'), hours)
      .replace(stryMutAct_9fa48('516') ? '' : (stryCov_9fa48('516'), 'mm'), minutes)
      .replace(stryMutAct_9fa48('517') ? '' : (stryCov_9fa48('517'), 'ss'), seconds);
  }
}
export function formatRelativeTime(date: Date | string): string {
  if (stryMutAct_9fa48('518')) {
    {
    }
  } else {
    stryCov_9fa48('518');
    const d = (
      stryMutAct_9fa48('521')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('520')
          ? false
          : stryMutAct_9fa48('519')
            ? true
            : (stryCov_9fa48('519', '520', '521'),
              typeof date === (stryMutAct_9fa48('522') ? '' : (stryCov_9fa48('522'), 'string')))
    )
      ? new Date(date)
      : date;
    const now = new Date();
    const diffMs = stryMutAct_9fa48('523')
      ? now.getTime() + d.getTime()
      : (stryCov_9fa48('523'), now.getTime() - d.getTime());
    const diffSec = Math.floor(
      stryMutAct_9fa48('524') ? diffMs * 1000 : (stryCov_9fa48('524'), diffMs / 1000)
    );
    const diffMin = Math.floor(
      stryMutAct_9fa48('525') ? diffSec * 60 : (stryCov_9fa48('525'), diffSec / 60)
    );
    const diffHour = Math.floor(
      stryMutAct_9fa48('526') ? diffMin * 60 : (stryCov_9fa48('526'), diffMin / 60)
    );
    const diffDay = Math.floor(
      stryMutAct_9fa48('527') ? diffHour * 24 : (stryCov_9fa48('527'), diffHour / 24)
    );
    if (
      stryMutAct_9fa48('531')
        ? diffSec >= 60
        : stryMutAct_9fa48('530')
          ? diffSec <= 60
          : stryMutAct_9fa48('529')
            ? false
            : stryMutAct_9fa48('528')
              ? true
              : (stryCov_9fa48('528', '529', '530', '531'), diffSec < 60)
    ) {
      if (stryMutAct_9fa48('532')) {
        {
        }
      } else {
        stryCov_9fa48('532');
        return stryMutAct_9fa48('533') ? `` : (stryCov_9fa48('533'), `${diffSec}秒前`);
      }
    }
    if (
      stryMutAct_9fa48('537')
        ? diffMin >= 60
        : stryMutAct_9fa48('536')
          ? diffMin <= 60
          : stryMutAct_9fa48('535')
            ? false
            : stryMutAct_9fa48('534')
              ? true
              : (stryCov_9fa48('534', '535', '536', '537'), diffMin < 60)
    ) {
      if (stryMutAct_9fa48('538')) {
        {
        }
      } else {
        stryCov_9fa48('538');
        return stryMutAct_9fa48('539') ? `` : (stryCov_9fa48('539'), `${diffMin}分钟前`);
      }
    }
    if (
      stryMutAct_9fa48('543')
        ? diffHour >= 24
        : stryMutAct_9fa48('542')
          ? diffHour <= 24
          : stryMutAct_9fa48('541')
            ? false
            : stryMutAct_9fa48('540')
              ? true
              : (stryCov_9fa48('540', '541', '542', '543'), diffHour < 24)
    ) {
      if (stryMutAct_9fa48('544')) {
        {
        }
      } else {
        stryCov_9fa48('544');
        return stryMutAct_9fa48('545') ? `` : (stryCov_9fa48('545'), `${diffHour}小时前`);
      }
    }
    if (
      stryMutAct_9fa48('549')
        ? diffDay >= 7
        : stryMutAct_9fa48('548')
          ? diffDay <= 7
          : stryMutAct_9fa48('547')
            ? false
            : stryMutAct_9fa48('546')
              ? true
              : (stryCov_9fa48('546', '547', '548', '549'), diffDay < 7)
    ) {
      if (stryMutAct_9fa48('550')) {
        {
        }
      } else {
        stryCov_9fa48('550');
        return stryMutAct_9fa48('551') ? `` : (stryCov_9fa48('551'), `${diffDay}天前`);
      }
    }
    return formatDate(d, stryMutAct_9fa48('552') ? '' : (stryCov_9fa48('552'), 'YYYY-MM-DD'));
  }
}
export function parseDate(dateStr: string): Date {
  if (stryMutAct_9fa48('553')) {
    {
    }
  } else {
    stryCov_9fa48('553');
    return new Date(dateStr);
  }
}
export function isToday(date: Date | string): boolean {
  if (stryMutAct_9fa48('554')) {
    {
    }
  } else {
    stryCov_9fa48('554');
    const d = (
      stryMutAct_9fa48('557')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('556')
          ? false
          : stryMutAct_9fa48('555')
            ? true
            : (stryCov_9fa48('555', '556', '557'),
              typeof date === (stryMutAct_9fa48('558') ? '' : (stryCov_9fa48('558'), 'string')))
    )
      ? new Date(date)
      : date;
    const today = new Date();
    return stryMutAct_9fa48('561')
      ? (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) ||
          d.getFullYear() === today.getFullYear()
      : stryMutAct_9fa48('560')
        ? false
        : stryMutAct_9fa48('559')
          ? true
          : (stryCov_9fa48('559', '560', '561'),
            (stryMutAct_9fa48('563')
              ? d.getDate() === today.getDate() || d.getMonth() === today.getMonth()
              : stryMutAct_9fa48('562')
                ? true
                : (stryCov_9fa48('562', '563'),
                  (stryMutAct_9fa48('565')
                    ? d.getDate() !== today.getDate()
                    : stryMutAct_9fa48('564')
                      ? true
                      : (stryCov_9fa48('564', '565'), d.getDate() === today.getDate())) &&
                    (stryMutAct_9fa48('567')
                      ? d.getMonth() !== today.getMonth()
                      : stryMutAct_9fa48('566')
                        ? true
                        : (stryCov_9fa48('566', '567'), d.getMonth() === today.getMonth())))) &&
              (stryMutAct_9fa48('569')
                ? d.getFullYear() !== today.getFullYear()
                : stryMutAct_9fa48('568')
                  ? true
                  : (stryCov_9fa48('568', '569'), d.getFullYear() === today.getFullYear())));
  }
}
export function addDays(date: Date, days: number): Date {
  if (stryMutAct_9fa48('570')) {
    {
    }
  } else {
    stryCov_9fa48('570');
    const result = new Date(date);
    stryMutAct_9fa48('571')
      ? result.setTime(result.getDate() + days)
      : (stryCov_9fa48('571'),
        result.setDate(
          stryMutAct_9fa48('572')
            ? result.getDate() - days
            : (stryCov_9fa48('572'), result.getDate() + days)
        ));
    return result;
  }
}
