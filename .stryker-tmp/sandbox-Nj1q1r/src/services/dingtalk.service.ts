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
import { error, info } from '../utils/logger.js';
const WEBHOOK_URL = process.env.DINGTALK_WEBHOOK_URL;
interface SendMessageResult {
  success: boolean;
  error?: string;
  messageId?: string;
}
export async function sendText(userId: string, content: string): Promise<SendMessageResult> {
  if (stryMutAct_9fa48('31')) {
    {
    }
  } else {
    stryCov_9fa48('31');
    if (
      stryMutAct_9fa48('34')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('33')
          ? false
          : stryMutAct_9fa48('32')
            ? true
            : (stryCov_9fa48('32', '33', '34'),
              (stryMutAct_9fa48('35') ? WEBHOOK_URL : (stryCov_9fa48('35'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(stryMutAct_9fa48('36') ? '' : (stryCov_9fa48('36'), 'xxx')))
    ) {
      if (stryMutAct_9fa48('37')) {
        {
        }
      } else {
        stryCov_9fa48('37');
        return stryMutAct_9fa48('38')
          ? {}
          : (stryCov_9fa48('38'),
            {
              success: stryMutAct_9fa48('39') ? true : (stryCov_9fa48('39'), false),
              error: stryMutAct_9fa48('40') ? '' : (stryCov_9fa48('40'), 'Webhook not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('41')) {
        {
        }
      } else {
        stryCov_9fa48('41');
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('42')
            ? {}
            : (stryCov_9fa48('42'),
              {
                method: stryMutAct_9fa48('43') ? '' : (stryCov_9fa48('43'), 'POST'),
                headers: stryMutAct_9fa48('44')
                  ? {}
                  : (stryCov_9fa48('44'),
                    {
                      'Content-Type': stryMutAct_9fa48('45')
                        ? ''
                        : (stryCov_9fa48('45'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('46')
                    ? {}
                    : (stryCov_9fa48('46'),
                      {
                        msgtype: stryMutAct_9fa48('47') ? '' : (stryCov_9fa48('47'), 'text'),
                        text: stryMutAct_9fa48('48')
                          ? {}
                          : (stryCov_9fa48('48'),
                            {
                              content: stryMutAct_9fa48('49')
                                ? ``
                                : (stryCov_9fa48('49'), `[Interview Bot]\n${content}`),
                            }),
                        at: stryMutAct_9fa48('50')
                          ? {}
                          : (stryCov_9fa48('50'),
                            {
                              atUserIds: stryMutAct_9fa48('51')
                                ? []
                                : (stryCov_9fa48('51'), [userId]),
                            }),
                      })
                ),
              })
        );
        if (
          stryMutAct_9fa48('54')
            ? false
            : stryMutAct_9fa48('53')
              ? true
              : stryMutAct_9fa48('52')
                ? response.ok
                : (stryCov_9fa48('52', '53', '54'), !response.ok)
        ) {
          if (stryMutAct_9fa48('55')) {
            {
            }
          } else {
            stryCov_9fa48('55');
            const errMsg = stryMutAct_9fa48('56')
              ? ``
              : (stryCov_9fa48('56'), `Failed to send message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('57')
              ? {}
              : (stryCov_9fa48('57'),
                {
                  success: stryMutAct_9fa48('58') ? true : (stryCov_9fa48('58'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('59') ? '' : (stryCov_9fa48('59'), 'Text message sent'),
          stryMutAct_9fa48('60')
            ? {}
            : (stryCov_9fa48('60'),
              {
                userId,
              })
        );
        return stryMutAct_9fa48('61')
          ? {}
          : (stryCov_9fa48('61'),
            {
              success: stryMutAct_9fa48('62') ? false : (stryCov_9fa48('62'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('63')) {
        {
        }
      } else {
        stryCov_9fa48('63');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('64')
              ? ''
              : (stryCov_9fa48('64'), 'Unknown error');
        error(
          stryMutAct_9fa48('65') ? '' : (stryCov_9fa48('65'), 'Failed to send DingTalk message'),
          stryMutAct_9fa48('66')
            ? {}
            : (stryCov_9fa48('66'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('67')
          ? {}
          : (stryCov_9fa48('67'),
            {
              success: stryMutAct_9fa48('68') ? true : (stryCov_9fa48('68'), false),
              error: errMsg,
            });
      }
    }
  }
}
export async function sendRichText(
  userId: string,
  title: string,
  text: string,
  buttons?: {
    title: string;
    actionURL: string;
  }[]
): Promise<SendMessageResult> {
  if (stryMutAct_9fa48('69')) {
    {
    }
  } else {
    stryCov_9fa48('69');
    if (
      stryMutAct_9fa48('72')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('71')
          ? false
          : stryMutAct_9fa48('70')
            ? true
            : (stryCov_9fa48('70', '71', '72'),
              (stryMutAct_9fa48('73') ? WEBHOOK_URL : (stryCov_9fa48('73'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(stryMutAct_9fa48('74') ? '' : (stryCov_9fa48('74'), 'xxx')))
    ) {
      if (stryMutAct_9fa48('75')) {
        {
        }
      } else {
        stryCov_9fa48('75');
        return stryMutAct_9fa48('76')
          ? {}
          : (stryCov_9fa48('76'),
            {
              success: stryMutAct_9fa48('77') ? true : (stryCov_9fa48('77'), false),
              error: stryMutAct_9fa48('78') ? '' : (stryCov_9fa48('78'), 'Webhook not configured'),
            });
      }
    }
    const markdown = stryMutAct_9fa48('79')
      ? {}
      : (stryCov_9fa48('79'),
        {
          title,
          text: stryMutAct_9fa48('80') ? `` : (stryCov_9fa48('80'), `### ${title}\n\n${text}`),
        });
    const actionCard = (
      stryMutAct_9fa48('81')
        ? buttons.length
        : (stryCov_9fa48('81'), buttons?.length)
    )
      ? stryMutAct_9fa48('82')
        ? {}
        : (stryCov_9fa48('82'),
          {
            title,
            text: stryMutAct_9fa48('83') ? `` : (stryCov_9fa48('83'), `### ${title}\n\n${text}`),
            btnOrientation: stryMutAct_9fa48('84') ? '' : (stryCov_9fa48('84'), '0'),
            btns: buttons.map(
              stryMutAct_9fa48('85')
                ? () => undefined
                : (stryCov_9fa48('85'),
                  (btn) =>
                    stryMutAct_9fa48('86')
                      ? {}
                      : (stryCov_9fa48('86'),
                        {
                          title: btn.title,
                          actionURL: btn.actionURL,
                        }))
            ),
          })
      : undefined;
    try {
      if (stryMutAct_9fa48('87')) {
        {
        }
      } else {
        stryCov_9fa48('87');
        const body = actionCard
          ? stryMutAct_9fa48('88')
            ? {}
            : (stryCov_9fa48('88'),
              {
                msgtype: stryMutAct_9fa48('89') ? '' : (stryCov_9fa48('89'), 'actionCard'),
                actionCard,
              })
          : stryMutAct_9fa48('90')
            ? {}
            : (stryCov_9fa48('90'),
              {
                msgtype: stryMutAct_9fa48('91') ? '' : (stryCov_9fa48('91'), 'markdown'),
                markdown,
              });
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('92')
            ? {}
            : (stryCov_9fa48('92'),
              {
                method: stryMutAct_9fa48('93') ? '' : (stryCov_9fa48('93'), 'POST'),
                headers: stryMutAct_9fa48('94')
                  ? {}
                  : (stryCov_9fa48('94'),
                    {
                      'Content-Type': stryMutAct_9fa48('95')
                        ? ''
                        : (stryCov_9fa48('95'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('98')
            ? false
            : stryMutAct_9fa48('97')
              ? true
              : stryMutAct_9fa48('96')
                ? response.ok
                : (stryCov_9fa48('96', '97', '98'), !response.ok)
        ) {
          if (stryMutAct_9fa48('99')) {
            {
            }
          } else {
            stryCov_9fa48('99');
            const errMsg = stryMutAct_9fa48('100')
              ? ``
              : (stryCov_9fa48('100'), `Failed to send rich message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('101')
              ? {}
              : (stryCov_9fa48('101'),
                {
                  success: stryMutAct_9fa48('102') ? true : (stryCov_9fa48('102'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('103') ? '' : (stryCov_9fa48('103'), 'Rich text message sent'),
          stryMutAct_9fa48('104')
            ? {}
            : (stryCov_9fa48('104'),
              {
                userId,
                hasButtons: stryMutAct_9fa48('105')
                  ? !buttons
                  : (stryCov_9fa48('105'),
                    !(stryMutAct_9fa48('106') ? buttons : (stryCov_9fa48('106'), !buttons))),
              })
        );
        return stryMutAct_9fa48('107')
          ? {}
          : (stryCov_9fa48('107'),
            {
              success: stryMutAct_9fa48('108') ? false : (stryCov_9fa48('108'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('109')) {
        {
        }
      } else {
        stryCov_9fa48('109');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('110')
              ? ''
              : (stryCov_9fa48('110'), 'Unknown error');
        error(
          stryMutAct_9fa48('111') ? '' : (stryCov_9fa48('111'), 'Failed to send rich message'),
          stryMutAct_9fa48('112')
            ? {}
            : (stryCov_9fa48('112'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('113')
          ? {}
          : (stryCov_9fa48('113'),
            {
              success: stryMutAct_9fa48('114') ? true : (stryCov_9fa48('114'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isWebhookConfigured(): boolean {
  if (stryMutAct_9fa48('115')) {
    {
    }
  } else {
    stryCov_9fa48('115');
    return stryMutAct_9fa48('118')
      ? !!WEBHOOK_URL || !WEBHOOK_URL.includes('xxx')
      : stryMutAct_9fa48('117')
        ? false
        : stryMutAct_9fa48('116')
          ? true
          : (stryCov_9fa48('116', '117', '118'),
            (stryMutAct_9fa48('119')
              ? !WEBHOOK_URL
              : (stryCov_9fa48('119'),
                !(stryMutAct_9fa48('120') ? WEBHOOK_URL : (stryCov_9fa48('120'), !WEBHOOK_URL)))) &&
              (stryMutAct_9fa48('121')
                ? WEBHOOK_URL.includes('xxx')
                : (stryCov_9fa48('121'),
                  !WEBHOOK_URL.includes(
                    stryMutAct_9fa48('122') ? '' : (stryCov_9fa48('122'), 'xxx')
                  ))));
  }
}
