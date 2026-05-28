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
  if (stryMutAct_9fa48('91')) {
    {
    }
  } else {
    stryCov_9fa48('91');
    if (
      stryMutAct_9fa48('94')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('93')
          ? false
          : stryMutAct_9fa48('92')
            ? true
            : (stryCov_9fa48('92', '93', '94'),
              (stryMutAct_9fa48('95') ? WEBHOOK_URL : (stryCov_9fa48('95'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(stryMutAct_9fa48('96') ? '' : (stryCov_9fa48('96'), 'xxx')))
    ) {
      if (stryMutAct_9fa48('97')) {
        {
        }
      } else {
        stryCov_9fa48('97');
        return stryMutAct_9fa48('98')
          ? {}
          : (stryCov_9fa48('98'),
            {
              success: stryMutAct_9fa48('99') ? true : (stryCov_9fa48('99'), false),
              error: stryMutAct_9fa48('100')
                ? ''
                : (stryCov_9fa48('100'), 'Webhook not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('101')) {
        {
        }
      } else {
        stryCov_9fa48('101');
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('102')
            ? {}
            : (stryCov_9fa48('102'),
              {
                method: stryMutAct_9fa48('103') ? '' : (stryCov_9fa48('103'), 'POST'),
                headers: stryMutAct_9fa48('104')
                  ? {}
                  : (stryCov_9fa48('104'),
                    {
                      'Content-Type': stryMutAct_9fa48('105')
                        ? ''
                        : (stryCov_9fa48('105'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('106')
                    ? {}
                    : (stryCov_9fa48('106'),
                      {
                        msgtype: stryMutAct_9fa48('107') ? '' : (stryCov_9fa48('107'), 'text'),
                        text: stryMutAct_9fa48('108')
                          ? {}
                          : (stryCov_9fa48('108'),
                            {
                              content: stryMutAct_9fa48('109')
                                ? ``
                                : (stryCov_9fa48('109'), `[Interview Bot]\n${content}`),
                            }),
                        at: stryMutAct_9fa48('110')
                          ? {}
                          : (stryCov_9fa48('110'),
                            {
                              atUserIds: stryMutAct_9fa48('111')
                                ? []
                                : (stryCov_9fa48('111'), [userId]),
                            }),
                      })
                ),
              })
        );
        if (
          stryMutAct_9fa48('114')
            ? false
            : stryMutAct_9fa48('113')
              ? true
              : stryMutAct_9fa48('112')
                ? response.ok
                : (stryCov_9fa48('112', '113', '114'), !response.ok)
        ) {
          if (stryMutAct_9fa48('115')) {
            {
            }
          } else {
            stryCov_9fa48('115');
            const errMsg = stryMutAct_9fa48('116')
              ? ``
              : (stryCov_9fa48('116'), `Failed to send message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('117')
              ? {}
              : (stryCov_9fa48('117'),
                {
                  success: stryMutAct_9fa48('118') ? true : (stryCov_9fa48('118'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('119') ? '' : (stryCov_9fa48('119'), 'Text message sent'),
          stryMutAct_9fa48('120')
            ? {}
            : (stryCov_9fa48('120'),
              {
                userId,
              })
        );
        return stryMutAct_9fa48('121')
          ? {}
          : (stryCov_9fa48('121'),
            {
              success: stryMutAct_9fa48('122') ? false : (stryCov_9fa48('122'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('123')) {
        {
        }
      } else {
        stryCov_9fa48('123');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('124')
              ? ''
              : (stryCov_9fa48('124'), 'Unknown error');
        error(
          stryMutAct_9fa48('125') ? '' : (stryCov_9fa48('125'), 'Failed to send DingTalk message'),
          stryMutAct_9fa48('126')
            ? {}
            : (stryCov_9fa48('126'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('127')
          ? {}
          : (stryCov_9fa48('127'),
            {
              success: stryMutAct_9fa48('128') ? true : (stryCov_9fa48('128'), false),
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
  if (stryMutAct_9fa48('129')) {
    {
    }
  } else {
    stryCov_9fa48('129');
    if (
      stryMutAct_9fa48('132')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('131')
          ? false
          : stryMutAct_9fa48('130')
            ? true
            : (stryCov_9fa48('130', '131', '132'),
              (stryMutAct_9fa48('133') ? WEBHOOK_URL : (stryCov_9fa48('133'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(stryMutAct_9fa48('134') ? '' : (stryCov_9fa48('134'), 'xxx')))
    ) {
      if (stryMutAct_9fa48('135')) {
        {
        }
      } else {
        stryCov_9fa48('135');
        return stryMutAct_9fa48('136')
          ? {}
          : (stryCov_9fa48('136'),
            {
              success: stryMutAct_9fa48('137') ? true : (stryCov_9fa48('137'), false),
              error: stryMutAct_9fa48('138')
                ? ''
                : (stryCov_9fa48('138'), 'Webhook not configured'),
            });
      }
    }
    const markdown = stryMutAct_9fa48('139')
      ? {}
      : (stryCov_9fa48('139'),
        {
          title,
          text: stryMutAct_9fa48('140') ? `` : (stryCov_9fa48('140'), `### ${title}\n\n${text}`),
        });
    const actionCard = (
      stryMutAct_9fa48('141')
        ? buttons.length
        : (stryCov_9fa48('141'), buttons?.length)
    )
      ? stryMutAct_9fa48('142')
        ? {}
        : (stryCov_9fa48('142'),
          {
            title,
            text: stryMutAct_9fa48('143') ? `` : (stryCov_9fa48('143'), `### ${title}\n\n${text}`),
            btnOrientation: stryMutAct_9fa48('144') ? '' : (stryCov_9fa48('144'), '0'),
            btns: buttons.map(
              stryMutAct_9fa48('145')
                ? () => undefined
                : (stryCov_9fa48('145'),
                  (btn) =>
                    stryMutAct_9fa48('146')
                      ? {}
                      : (stryCov_9fa48('146'),
                        {
                          title: btn.title,
                          actionURL: btn.actionURL,
                        }))
            ),
          })
      : undefined;
    try {
      if (stryMutAct_9fa48('147')) {
        {
        }
      } else {
        stryCov_9fa48('147');
        const body = actionCard
          ? stryMutAct_9fa48('148')
            ? {}
            : (stryCov_9fa48('148'),
              {
                msgtype: stryMutAct_9fa48('149') ? '' : (stryCov_9fa48('149'), 'actionCard'),
                actionCard,
              })
          : stryMutAct_9fa48('150')
            ? {}
            : (stryCov_9fa48('150'),
              {
                msgtype: stryMutAct_9fa48('151') ? '' : (stryCov_9fa48('151'), 'markdown'),
                markdown,
              });
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('152')
            ? {}
            : (stryCov_9fa48('152'),
              {
                method: stryMutAct_9fa48('153') ? '' : (stryCov_9fa48('153'), 'POST'),
                headers: stryMutAct_9fa48('154')
                  ? {}
                  : (stryCov_9fa48('154'),
                    {
                      'Content-Type': stryMutAct_9fa48('155')
                        ? ''
                        : (stryCov_9fa48('155'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('158')
            ? false
            : stryMutAct_9fa48('157')
              ? true
              : stryMutAct_9fa48('156')
                ? response.ok
                : (stryCov_9fa48('156', '157', '158'), !response.ok)
        ) {
          if (stryMutAct_9fa48('159')) {
            {
            }
          } else {
            stryCov_9fa48('159');
            const errMsg = stryMutAct_9fa48('160')
              ? ``
              : (stryCov_9fa48('160'), `Failed to send rich message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('161')
              ? {}
              : (stryCov_9fa48('161'),
                {
                  success: stryMutAct_9fa48('162') ? true : (stryCov_9fa48('162'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('163') ? '' : (stryCov_9fa48('163'), 'Rich text message sent'),
          stryMutAct_9fa48('164')
            ? {}
            : (stryCov_9fa48('164'),
              {
                userId,
                hasButtons: stryMutAct_9fa48('165')
                  ? !buttons
                  : (stryCov_9fa48('165'),
                    !(stryMutAct_9fa48('166') ? buttons : (stryCov_9fa48('166'), !buttons))),
              })
        );
        return stryMutAct_9fa48('167')
          ? {}
          : (stryCov_9fa48('167'),
            {
              success: stryMutAct_9fa48('168') ? false : (stryCov_9fa48('168'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('169')) {
        {
        }
      } else {
        stryCov_9fa48('169');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('170')
              ? ''
              : (stryCov_9fa48('170'), 'Unknown error');
        error(
          stryMutAct_9fa48('171') ? '' : (stryCov_9fa48('171'), 'Failed to send rich message'),
          stryMutAct_9fa48('172')
            ? {}
            : (stryCov_9fa48('172'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('173')
          ? {}
          : (stryCov_9fa48('173'),
            {
              success: stryMutAct_9fa48('174') ? true : (stryCov_9fa48('174'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isWebhookConfigured(): boolean {
  if (stryMutAct_9fa48('175')) {
    {
    }
  } else {
    stryCov_9fa48('175');
    return stryMutAct_9fa48('178')
      ? !!WEBHOOK_URL || !WEBHOOK_URL.includes('xxx')
      : stryMutAct_9fa48('177')
        ? false
        : stryMutAct_9fa48('176')
          ? true
          : (stryCov_9fa48('176', '177', '178'),
            (stryMutAct_9fa48('179')
              ? !WEBHOOK_URL
              : (stryCov_9fa48('179'),
                !(stryMutAct_9fa48('180') ? WEBHOOK_URL : (stryCov_9fa48('180'), !WEBHOOK_URL)))) &&
              (stryMutAct_9fa48('181')
                ? WEBHOOK_URL.includes('xxx')
                : (stryCov_9fa48('181'),
                  !WEBHOOK_URL.includes(
                    stryMutAct_9fa48('182') ? '' : (stryCov_9fa48('182'), 'xxx')
                  ))));
  }
}
