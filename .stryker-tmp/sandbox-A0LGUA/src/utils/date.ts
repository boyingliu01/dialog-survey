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
  format = stryMutAct_9fa48('3911') ? '' : (stryCov_9fa48('3911'), 'YYYY-MM-DD')
): string {
  if (stryMutAct_9fa48('3912')) {
    {
    }
  } else {
    stryCov_9fa48('3912');
    const d = (
      stryMutAct_9fa48('3915')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('3914')
          ? false
          : stryMutAct_9fa48('3913')
            ? true
            : (stryCov_9fa48('3913', '3914', '3915'),
              typeof date === (stryMutAct_9fa48('3916') ? '' : (stryCov_9fa48('3916'), 'string')))
    )
      ? new Date(date)
      : date;
    const year = d.getFullYear();
    const month = String(
      stryMutAct_9fa48('3917') ? d.getMonth() - 1 : (stryCov_9fa48('3917'), d.getMonth() + 1)
    ).padStart(2, stryMutAct_9fa48('3918') ? '' : (stryCov_9fa48('3918'), '0'));
    const day = String(d.getDate()).padStart(
      2,
      stryMutAct_9fa48('3919') ? '' : (stryCov_9fa48('3919'), '0')
    );
    const hours = String(d.getHours()).padStart(
      2,
      stryMutAct_9fa48('3920') ? '' : (stryCov_9fa48('3920'), '0')
    );
    const minutes = String(d.getMinutes()).padStart(
      2,
      stryMutAct_9fa48('3921') ? '' : (stryCov_9fa48('3921'), '0')
    );
    const seconds = String(d.getSeconds()).padStart(
      2,
      stryMutAct_9fa48('3922') ? '' : (stryCov_9fa48('3922'), '0')
    );
    return format
      .replace(stryMutAct_9fa48('3923') ? '' : (stryCov_9fa48('3923'), 'YYYY'), String(year))
      .replace(stryMutAct_9fa48('3924') ? '' : (stryCov_9fa48('3924'), 'MM'), month)
      .replace(stryMutAct_9fa48('3925') ? '' : (stryCov_9fa48('3925'), 'DD'), day)
      .replace(stryMutAct_9fa48('3926') ? '' : (stryCov_9fa48('3926'), 'HH'), hours)
      .replace(stryMutAct_9fa48('3927') ? '' : (stryCov_9fa48('3927'), 'mm'), minutes)
      .replace(stryMutAct_9fa48('3928') ? '' : (stryCov_9fa48('3928'), 'ss'), seconds);
  }
}
export function formatRelativeTime(date: Date | string): string {
  if (stryMutAct_9fa48('3929')) {
    {
    }
  } else {
    stryCov_9fa48('3929');
    const d = (
      stryMutAct_9fa48('3932')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('3931')
          ? false
          : stryMutAct_9fa48('3930')
            ? true
            : (stryCov_9fa48('3930', '3931', '3932'),
              typeof date === (stryMutAct_9fa48('3933') ? '' : (stryCov_9fa48('3933'), 'string')))
    )
      ? new Date(date)
      : date;
    const now = new Date();
    const diffMs = stryMutAct_9fa48('3934')
      ? now.getTime() + d.getTime()
      : (stryCov_9fa48('3934'), now.getTime() - d.getTime());
    const diffSec = Math.floor(
      stryMutAct_9fa48('3935') ? diffMs * 1000 : (stryCov_9fa48('3935'), diffMs / 1000)
    );
    const diffMin = Math.floor(
      stryMutAct_9fa48('3936') ? diffSec * 60 : (stryCov_9fa48('3936'), diffSec / 60)
    );
    const diffHour = Math.floor(
      stryMutAct_9fa48('3937') ? diffMin * 60 : (stryCov_9fa48('3937'), diffMin / 60)
    );
    const diffDay = Math.floor(
      stryMutAct_9fa48('3938') ? diffHour * 24 : (stryCov_9fa48('3938'), diffHour / 24)
    );
    if (
      stryMutAct_9fa48('3942')
        ? diffSec >= 60
        : stryMutAct_9fa48('3941')
          ? diffSec <= 60
          : stryMutAct_9fa48('3940')
            ? false
            : stryMutAct_9fa48('3939')
              ? true
              : (stryCov_9fa48('3939', '3940', '3941', '3942'), diffSec < 60)
    ) {
      if (stryMutAct_9fa48('3943')) {
        {
        }
      } else {
        stryCov_9fa48('3943');
        return stryMutAct_9fa48('3944') ? `` : (stryCov_9fa48('3944'), `${diffSec}秒前`);
      }
    }
    if (
      stryMutAct_9fa48('3948')
        ? diffMin >= 60
        : stryMutAct_9fa48('3947')
          ? diffMin <= 60
          : stryMutAct_9fa48('3946')
            ? false
            : stryMutAct_9fa48('3945')
              ? true
              : (stryCov_9fa48('3945', '3946', '3947', '3948'), diffMin < 60)
    ) {
      if (stryMutAct_9fa48('3949')) {
        {
        }
      } else {
        stryCov_9fa48('3949');
        return stryMutAct_9fa48('3950') ? `` : (stryCov_9fa48('3950'), `${diffMin}分钟前`);
      }
    }
    if (
      stryMutAct_9fa48('3954')
        ? diffHour >= 24
        : stryMutAct_9fa48('3953')
          ? diffHour <= 24
          : stryMutAct_9fa48('3952')
            ? false
            : stryMutAct_9fa48('3951')
              ? true
              : (stryCov_9fa48('3951', '3952', '3953', '3954'), diffHour < 24)
    ) {
      if (stryMutAct_9fa48('3955')) {
        {
        }
      } else {
        stryCov_9fa48('3955');
        return stryMutAct_9fa48('3956') ? `` : (stryCov_9fa48('3956'), `${diffHour}小时前`);
      }
    }
    if (
      stryMutAct_9fa48('3960')
        ? diffDay >= 7
        : stryMutAct_9fa48('3959')
          ? diffDay <= 7
          : stryMutAct_9fa48('3958')
            ? false
            : stryMutAct_9fa48('3957')
              ? true
              : (stryCov_9fa48('3957', '3958', '3959', '3960'), diffDay < 7)
    ) {
      if (stryMutAct_9fa48('3961')) {
        {
        }
      } else {
        stryCov_9fa48('3961');
        return stryMutAct_9fa48('3962') ? `` : (stryCov_9fa48('3962'), `${diffDay}天前`);
      }
    }
    return formatDate(d, stryMutAct_9fa48('3963') ? '' : (stryCov_9fa48('3963'), 'YYYY-MM-DD'));
  }
}
export function parseDate(dateStr: string): Date {
  if (stryMutAct_9fa48('3964')) {
    {
    }
  } else {
    stryCov_9fa48('3964');
    return new Date(dateStr);
  }
}
export function isToday(date: Date | string): boolean {
  if (stryMutAct_9fa48('3965')) {
    {
    }
  } else {
    stryCov_9fa48('3965');
    const d = (
      stryMutAct_9fa48('3968')
        ? typeof date !== 'string'
        : stryMutAct_9fa48('3967')
          ? false
          : stryMutAct_9fa48('3966')
            ? true
            : (stryCov_9fa48('3966', '3967', '3968'),
              typeof date === (stryMutAct_9fa48('3969') ? '' : (stryCov_9fa48('3969'), 'string')))
    )
      ? new Date(date)
      : date;
    const today = new Date();
    return stryMutAct_9fa48('3972')
      ? (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) ||
          d.getFullYear() === today.getFullYear()
      : stryMutAct_9fa48('3971')
        ? false
        : stryMutAct_9fa48('3970')
          ? true
          : (stryCov_9fa48('3970', '3971', '3972'),
            (stryMutAct_9fa48('3974')
              ? d.getDate() === today.getDate() || d.getMonth() === today.getMonth()
              : stryMutAct_9fa48('3973')
                ? true
                : (stryCov_9fa48('3973', '3974'),
                  (stryMutAct_9fa48('3976')
                    ? d.getDate() !== today.getDate()
                    : stryMutAct_9fa48('3975')
                      ? true
                      : (stryCov_9fa48('3975', '3976'), d.getDate() === today.getDate())) &&
                    (stryMutAct_9fa48('3978')
                      ? d.getMonth() !== today.getMonth()
                      : stryMutAct_9fa48('3977')
                        ? true
                        : (stryCov_9fa48('3977', '3978'), d.getMonth() === today.getMonth())))) &&
              (stryMutAct_9fa48('3980')
                ? d.getFullYear() !== today.getFullYear()
                : stryMutAct_9fa48('3979')
                  ? true
                  : (stryCov_9fa48('3979', '3980'), d.getFullYear() === today.getFullYear())));
  }
}
export function addDays(date: Date, days: number): Date {
  if (stryMutAct_9fa48('3981')) {
    {
    }
  } else {
    stryCov_9fa48('3981');
    const result = new Date(date);
    stryMutAct_9fa48('3982')
      ? result.setTime(result.getDate() + days)
      : (stryCov_9fa48('3982'),
        result.setDate(
          stryMutAct_9fa48('3983')
            ? result.getDate() - days
            : (stryCov_9fa48('3983'), result.getDate() + days)
        ));
    return result;
  }
}
