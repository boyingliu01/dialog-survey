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
  format = stryMutAct_9fa48('477') ? '' : (stryCov_9fa48('477'), 'YYYY-MM-DD')
): string {
  if (stryMutAct_9fa48('478')) {
    {
    }
  } else {
    stryCov_9fa48('478');
    const d = (
      stryMutAct_9fa48('481')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('480')
          ? false
          : stryMutAct_9fa48('479')
            ? true
            : (stryCov_9fa48('479', '480', '481'),
              typeof date === (stryMutAct_9fa48('482') ? '' : (stryCov_9fa48('482'), 'string')))
    )
      ? new Date(date)
      : date;
    const year = d.getFullYear();
    const month = String(
      stryMutAct_9fa48('483') ? d.getMonth() - 1 : (stryCov_9fa48('483'), d.getMonth() + 1)
    ).padStart(2, stryMutAct_9fa48('484') ? '' : (stryCov_9fa48('484'), '0'));
    const day = String(d.getDate()).padStart(
      2,
      stryMutAct_9fa48('485') ? '' : (stryCov_9fa48('485'), '0')
    );
    const hours = String(d.getHours()).padStart(
      2,
      stryMutAct_9fa48('486') ? '' : (stryCov_9fa48('486'), '0')
    );
    const minutes = String(d.getMinutes()).padStart(
      2,
      stryMutAct_9fa48('487') ? '' : (stryCov_9fa48('487'), '0')
    );
    const seconds = String(d.getSeconds()).padStart(
      2,
      stryMutAct_9fa48('488') ? '' : (stryCov_9fa48('488'), '0')
    );
    return format
      .replace(stryMutAct_9fa48('489') ? '' : (stryCov_9fa48('489'), 'YYYY'), String(year))
      .replace(stryMutAct_9fa48('490') ? '' : (stryCov_9fa48('490'), 'MM'), month)
      .replace(stryMutAct_9fa48('491') ? '' : (stryCov_9fa48('491'), 'DD'), day)
      .replace(stryMutAct_9fa48('492') ? '' : (stryCov_9fa48('492'), 'HH'), hours)
      .replace(stryMutAct_9fa48('493') ? '' : (stryCov_9fa48('493'), 'mm'), minutes)
      .replace(stryMutAct_9fa48('494') ? '' : (stryCov_9fa48('494'), 'ss'), seconds);
  }
}
export function formatRelativeTime(date: Date | string): string {
  if (stryMutAct_9fa48('495')) {
    {
    }
  } else {
    stryCov_9fa48('495');
    const d = (
      stryMutAct_9fa48('498')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('497')
          ? false
          : stryMutAct_9fa48('496')
            ? true
            : (stryCov_9fa48('496', '497', '498'),
              typeof date === (stryMutAct_9fa48('499') ? '' : (stryCov_9fa48('499'), 'string')))
    )
      ? new Date(date)
      : date;
    const now = new Date();
    const diffMs = stryMutAct_9fa48('500')
      ? now.getTime() + d.getTime()
      : (stryCov_9fa48('500'), now.getTime() - d.getTime());
    const diffSec = Math.floor(
      stryMutAct_9fa48('501') ? diffMs * 1000 : (stryCov_9fa48('501'), diffMs / 1000)
    );
    const diffMin = Math.floor(
      stryMutAct_9fa48('502') ? diffSec * 60 : (stryCov_9fa48('502'), diffSec / 60)
    );
    const diffHour = Math.floor(
      stryMutAct_9fa48('503') ? diffMin * 60 : (stryCov_9fa48('503'), diffMin / 60)
    );
    const diffDay = Math.floor(
      stryMutAct_9fa48('504') ? diffHour * 24 : (stryCov_9fa48('504'), diffHour / 24)
    );
    if (
      stryMutAct_9fa48('508')
        ? diffSec >= 60
        : stryMutAct_9fa48('507')
          ? diffSec <= 60
          : stryMutAct_9fa48('506')
            ? false
            : stryMutAct_9fa48('505')
              ? true
              : (stryCov_9fa48('505', '506', '507', '508'), diffSec < 60)
    ) {
      if (stryMutAct_9fa48('509')) {
        {
        }
      } else {
        stryCov_9fa48('509');
        return stryMutAct_9fa48('510') ? `` : (stryCov_9fa48('510'), `${diffSec}秒前`);
      }
    }
    if (
      stryMutAct_9fa48('514')
        ? diffMin >= 60
        : stryMutAct_9fa48('513')
          ? diffMin <= 60
          : stryMutAct_9fa48('512')
            ? false
            : stryMutAct_9fa48('511')
              ? true
              : (stryCov_9fa48('511', '512', '513', '514'), diffMin < 60)
    ) {
      if (stryMutAct_9fa48('515')) {
        {
        }
      } else {
        stryCov_9fa48('515');
        return stryMutAct_9fa48('516') ? `` : (stryCov_9fa48('516'), `${diffMin}分钟前`);
      }
    }
    if (
      stryMutAct_9fa48('520')
        ? diffHour >= 24
        : stryMutAct_9fa48('519')
          ? diffHour <= 24
          : stryMutAct_9fa48('518')
            ? false
            : stryMutAct_9fa48('517')
              ? true
              : (stryCov_9fa48('517', '518', '519', '520'), diffHour < 24)
    ) {
      if (stryMutAct_9fa48('521')) {
        {
        }
      } else {
        stryCov_9fa48('521');
        return stryMutAct_9fa48('522') ? `` : (stryCov_9fa48('522'), `${diffHour}小时前`);
      }
    }
    if (
      stryMutAct_9fa48('526')
        ? diffDay >= 7
        : stryMutAct_9fa48('525')
          ? diffDay <= 7
          : stryMutAct_9fa48('524')
            ? false
            : stryMutAct_9fa48('523')
              ? true
              : (stryCov_9fa48('523', '524', '525', '526'), diffDay < 7)
    ) {
      if (stryMutAct_9fa48('527')) {
        {
        }
      } else {
        stryCov_9fa48('527');
        return stryMutAct_9fa48('528') ? `` : (stryCov_9fa48('528'), `${diffDay}天前`);
      }
    }
    return formatDate(d, stryMutAct_9fa48('529') ? '' : (stryCov_9fa48('529'), 'YYYY-MM-DD'));
  }
}
export function parseDate(dateStr: string): Date {
  if (stryMutAct_9fa48('530')) {
    {
    }
  } else {
    stryCov_9fa48('530');
    return new Date(dateStr);
  }
}
export function isToday(date: Date | string): boolean {
  if (stryMutAct_9fa48('531')) {
    {
    }
  } else {
    stryCov_9fa48('531');
    const d = (
      stryMutAct_9fa48('534')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('533')
          ? false
          : stryMutAct_9fa48('532')
            ? true
            : (stryCov_9fa48('532', '533', '534'),
              typeof date === (stryMutAct_9fa48('535') ? '' : (stryCov_9fa48('535'), 'string')))
    )
      ? new Date(date)
      : date;
    const today = new Date();
    return stryMutAct_9fa48('538')
      ? (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) ||
          d.getFullYear() === today.getFullYear()
      : stryMutAct_9fa48('537')
        ? false
        : stryMutAct_9fa48('536')
          ? true
          : (stryCov_9fa48('536', '537', '538'),
            (stryMutAct_9fa48('540')
              ? d.getDate() === today.getDate() || d.getMonth() === today.getMonth()
              : stryMutAct_9fa48('539')
                ? true
                : (stryCov_9fa48('539', '540'),
                  (stryMutAct_9fa48('542')
                    ? d.getDate() !== today.getDate()
                    : stryMutAct_9fa48('541')
                      ? true
                      : (stryCov_9fa48('541', '542'), d.getDate() === today.getDate())) &&
                    (stryMutAct_9fa48('544')
                      ? d.getMonth() !== today.getMonth()
                      : stryMutAct_9fa48('543')
                        ? true
                        : (stryCov_9fa48('543', '544'), d.getMonth() === today.getMonth())))) &&
              (stryMutAct_9fa48('546')
                ? d.getFullYear() !== today.getFullYear()
                : stryMutAct_9fa48('545')
                  ? true
                  : (stryCov_9fa48('545', '546'), d.getFullYear() === today.getFullYear())));
  }
}
export function addDays(date: Date, days: number): Date {
  if (stryMutAct_9fa48('547')) {
    {
    }
  } else {
    stryCov_9fa48('547');
    const result = new Date(date);
    stryMutAct_9fa48('548')
      ? result.setTime(result.getDate() + days)
      : (stryCov_9fa48('548'),
        result.setDate(
          stryMutAct_9fa48('549')
            ? result.getDate() - days
            : (stryCov_9fa48('549'), result.getDate() + days)
        ));
    return result;
  }
}
