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
  if (stryMutAct_9fa48('2844')) {
    {
    }
  } else {
    stryCov_9fa48('2844');
    if (
      stryMutAct_9fa48('2847')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('2846')
          ? false
          : stryMutAct_9fa48('2845')
            ? true
            : (stryCov_9fa48('2845', '2846', '2847'),
              (stryMutAct_9fa48('2848') ? WEBHOOK_URL : (stryCov_9fa48('2848'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(
                  stryMutAct_9fa48('2849') ? '' : (stryCov_9fa48('2849'), 'xxx')
                ))
    ) {
      if (stryMutAct_9fa48('2850')) {
        {
        }
      } else {
        stryCov_9fa48('2850');
        return stryMutAct_9fa48('2851')
          ? {}
          : (stryCov_9fa48('2851'),
            {
              success: stryMutAct_9fa48('2852') ? true : (stryCov_9fa48('2852'), false),
              error: stryMutAct_9fa48('2853')
                ? ''
                : (stryCov_9fa48('2853'), 'Webhook not configured'),
            });
      }
    }
    try {
      if (stryMutAct_9fa48('2854')) {
        {
        }
      } else {
        stryCov_9fa48('2854');
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('2855')
            ? {}
            : (stryCov_9fa48('2855'),
              {
                method: stryMutAct_9fa48('2856') ? '' : (stryCov_9fa48('2856'), 'POST'),
                headers: stryMutAct_9fa48('2857')
                  ? {}
                  : (stryCov_9fa48('2857'),
                    {
                      'Content-Type': stryMutAct_9fa48('2858')
                        ? ''
                        : (stryCov_9fa48('2858'), 'application/json'),
                    }),
                body: JSON.stringify(
                  stryMutAct_9fa48('2859')
                    ? {}
                    : (stryCov_9fa48('2859'),
                      {
                        msgtype: stryMutAct_9fa48('2860') ? '' : (stryCov_9fa48('2860'), 'text'),
                        text: stryMutAct_9fa48('2861')
                          ? {}
                          : (stryCov_9fa48('2861'),
                            {
                              content: stryMutAct_9fa48('2862')
                                ? ``
                                : (stryCov_9fa48('2862'), `[Interview Bot]\n${content}`),
                            }),
                        at: stryMutAct_9fa48('2863')
                          ? {}
                          : (stryCov_9fa48('2863'),
                            {
                              atUserIds: stryMutAct_9fa48('2864')
                                ? []
                                : (stryCov_9fa48('2864'), [userId]),
                            }),
                      })
                ),
              })
        );
        if (
          stryMutAct_9fa48('2867')
            ? false
            : stryMutAct_9fa48('2866')
              ? true
              : stryMutAct_9fa48('2865')
                ? response.ok
                : (stryCov_9fa48('2865', '2866', '2867'), !response.ok)
        ) {
          if (stryMutAct_9fa48('2868')) {
            {
            }
          } else {
            stryCov_9fa48('2868');
            const errMsg = stryMutAct_9fa48('2869')
              ? ``
              : (stryCov_9fa48('2869'), `Failed to send message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('2870')
              ? {}
              : (stryCov_9fa48('2870'),
                {
                  success: stryMutAct_9fa48('2871') ? true : (stryCov_9fa48('2871'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('2872') ? '' : (stryCov_9fa48('2872'), 'Text message sent'),
          stryMutAct_9fa48('2873')
            ? {}
            : (stryCov_9fa48('2873'),
              {
                userId,
              })
        );
        return stryMutAct_9fa48('2874')
          ? {}
          : (stryCov_9fa48('2874'),
            {
              success: stryMutAct_9fa48('2875') ? false : (stryCov_9fa48('2875'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('2876')) {
        {
        }
      } else {
        stryCov_9fa48('2876');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('2877')
              ? ''
              : (stryCov_9fa48('2877'), 'Unknown error');
        error(
          stryMutAct_9fa48('2878')
            ? ''
            : (stryCov_9fa48('2878'), 'Failed to send DingTalk message'),
          stryMutAct_9fa48('2879')
            ? {}
            : (stryCov_9fa48('2879'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('2880')
          ? {}
          : (stryCov_9fa48('2880'),
            {
              success: stryMutAct_9fa48('2881') ? true : (stryCov_9fa48('2881'), false),
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
  if (stryMutAct_9fa48('2882')) {
    {
    }
  } else {
    stryCov_9fa48('2882');
    if (
      stryMutAct_9fa48('2885')
        ? !WEBHOOK_URL && WEBHOOK_URL.includes('xxx')
        : stryMutAct_9fa48('2884')
          ? false
          : stryMutAct_9fa48('2883')
            ? true
            : (stryCov_9fa48('2883', '2884', '2885'),
              (stryMutAct_9fa48('2886') ? WEBHOOK_URL : (stryCov_9fa48('2886'), !WEBHOOK_URL)) ||
                WEBHOOK_URL.includes(
                  stryMutAct_9fa48('2887') ? '' : (stryCov_9fa48('2887'), 'xxx')
                ))
    ) {
      if (stryMutAct_9fa48('2888')) {
        {
        }
      } else {
        stryCov_9fa48('2888');
        return stryMutAct_9fa48('2889')
          ? {}
          : (stryCov_9fa48('2889'),
            {
              success: stryMutAct_9fa48('2890') ? true : (stryCov_9fa48('2890'), false),
              error: stryMutAct_9fa48('2891')
                ? ''
                : (stryCov_9fa48('2891'), 'Webhook not configured'),
            });
      }
    }
    const markdown = stryMutAct_9fa48('2892')
      ? {}
      : (stryCov_9fa48('2892'),
        {
          title,
          text: stryMutAct_9fa48('2893') ? `` : (stryCov_9fa48('2893'), `### ${title}\n\n${text}`),
        });
    const actionCard = (
      stryMutAct_9fa48('2894')
        ? buttons.length
        : (stryCov_9fa48('2894'), buttons?.length)
    )
      ? stryMutAct_9fa48('2895')
        ? {}
        : (stryCov_9fa48('2895'),
          {
            title,
            text: stryMutAct_9fa48('2896')
              ? ``
              : (stryCov_9fa48('2896'), `### ${title}\n\n${text}`),
            btnOrientation: stryMutAct_9fa48('2897') ? '' : (stryCov_9fa48('2897'), '0'),
            btns: buttons.map(
              stryMutAct_9fa48('2898')
                ? () => undefined
                : (stryCov_9fa48('2898'),
                  (btn) =>
                    stryMutAct_9fa48('2899')
                      ? {}
                      : (stryCov_9fa48('2899'),
                        {
                          title: btn.title,
                          actionURL: btn.actionURL,
                        }))
            ),
          })
      : undefined;
    try {
      if (stryMutAct_9fa48('2900')) {
        {
        }
      } else {
        stryCov_9fa48('2900');
        const body = actionCard
          ? stryMutAct_9fa48('2901')
            ? {}
            : (stryCov_9fa48('2901'),
              {
                msgtype: stryMutAct_9fa48('2902') ? '' : (stryCov_9fa48('2902'), 'actionCard'),
                actionCard,
              })
          : stryMutAct_9fa48('2903')
            ? {}
            : (stryCov_9fa48('2903'),
              {
                msgtype: stryMutAct_9fa48('2904') ? '' : (stryCov_9fa48('2904'), 'markdown'),
                markdown,
              });
        const response = await fetch(
          WEBHOOK_URL,
          stryMutAct_9fa48('2905')
            ? {}
            : (stryCov_9fa48('2905'),
              {
                method: stryMutAct_9fa48('2906') ? '' : (stryCov_9fa48('2906'), 'POST'),
                headers: stryMutAct_9fa48('2907')
                  ? {}
                  : (stryCov_9fa48('2907'),
                    {
                      'Content-Type': stryMutAct_9fa48('2908')
                        ? ''
                        : (stryCov_9fa48('2908'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('2911')
            ? false
            : stryMutAct_9fa48('2910')
              ? true
              : stryMutAct_9fa48('2909')
                ? response.ok
                : (stryCov_9fa48('2909', '2910', '2911'), !response.ok)
        ) {
          if (stryMutAct_9fa48('2912')) {
            {
            }
          } else {
            stryCov_9fa48('2912');
            const errMsg = stryMutAct_9fa48('2913')
              ? ``
              : (stryCov_9fa48('2913'), `Failed to send rich message: ${response.status}`);
            error(errMsg);
            return stryMutAct_9fa48('2914')
              ? {}
              : (stryCov_9fa48('2914'),
                {
                  success: stryMutAct_9fa48('2915') ? true : (stryCov_9fa48('2915'), false),
                  error: errMsg,
                });
          }
        }
        info(
          stryMutAct_9fa48('2916') ? '' : (stryCov_9fa48('2916'), 'Rich text message sent'),
          stryMutAct_9fa48('2917')
            ? {}
            : (stryCov_9fa48('2917'),
              {
                userId,
                hasButtons: stryMutAct_9fa48('2918')
                  ? !buttons
                  : (stryCov_9fa48('2918'),
                    !(stryMutAct_9fa48('2919') ? buttons : (stryCov_9fa48('2919'), !buttons))),
              })
        );
        return stryMutAct_9fa48('2920')
          ? {}
          : (stryCov_9fa48('2920'),
            {
              success: stryMutAct_9fa48('2921') ? false : (stryCov_9fa48('2921'), true),
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('2922')) {
        {
        }
      } else {
        stryCov_9fa48('2922');
        const errMsg =
          e instanceof Error
            ? e.message
            : stryMutAct_9fa48('2923')
              ? ''
              : (stryCov_9fa48('2923'), 'Unknown error');
        error(
          stryMutAct_9fa48('2924') ? '' : (stryCov_9fa48('2924'), 'Failed to send rich message'),
          stryMutAct_9fa48('2925')
            ? {}
            : (stryCov_9fa48('2925'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('2926')
          ? {}
          : (stryCov_9fa48('2926'),
            {
              success: stryMutAct_9fa48('2927') ? true : (stryCov_9fa48('2927'), false),
              error: errMsg,
            });
      }
    }
  }
}
export function isWebhookConfigured(): boolean {
  if (stryMutAct_9fa48('2928')) {
    {
    }
  } else {
    stryCov_9fa48('2928');
    return stryMutAct_9fa48('2931')
      ? !!WEBHOOK_URL || !WEBHOOK_URL.includes('xxx')
      : stryMutAct_9fa48('2930')
        ? false
        : stryMutAct_9fa48('2929')
          ? true
          : (stryCov_9fa48('2929', '2930', '2931'),
            (stryMutAct_9fa48('2932')
              ? !WEBHOOK_URL
              : (stryCov_9fa48('2932'),
                !(stryMutAct_9fa48('2933')
                  ? WEBHOOK_URL
                  : (stryCov_9fa48('2933'), !WEBHOOK_URL)))) &&
              (stryMutAct_9fa48('2934')
                ? WEBHOOK_URL.includes('xxx')
                : (stryCov_9fa48('2934'),
                  !WEBHOOK_URL.includes(
                    stryMutAct_9fa48('2935') ? '' : (stryCov_9fa48('2935'), 'xxx')
                  ))));
  }
}
