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
import { tokenManager } from './token-manager.js';
export interface ActionCardContent {
  title: string;
  text: string;
  singleTitle: string;
  singleURL: string;
}
export interface SendResult {
  taskId: string;
  successCount: number;
  failedUserIds: string[];
  errors?: {
    userId: string;
    error: string;
  }[];
}
export class DingTalkMessageSender {
  private readonly BATCH_SIZE = 100;
  async sendTextMessage(userIds: string[], content: string): Promise<SendResult> {
    if (stryMutAct_9fa48('1363')) {
      {
      }
    } else {
      stryCov_9fa48('1363');
      return this.sendInBatches(
        userIds,
        stryMutAct_9fa48('1364')
          ? () => undefined
          : (stryCov_9fa48('1364'),
            (batch) =>
              this.doSend(
                batch,
                stryMutAct_9fa48('1365')
                  ? {}
                  : (stryCov_9fa48('1365'),
                    {
                      msgtype: stryMutAct_9fa48('1366') ? '' : (stryCov_9fa48('1366'), 'text'),
                      text: stryMutAct_9fa48('1367')
                        ? {}
                        : (stryCov_9fa48('1367'),
                          {
                            content,
                          }),
                    })
              ))
      );
    }
  }
  async sendActionCard(userIds: string[], card: ActionCardContent): Promise<SendResult> {
    if (stryMutAct_9fa48('1368')) {
      {
      }
    } else {
      stryCov_9fa48('1368');
      return this.sendInBatches(
        userIds,
        stryMutAct_9fa48('1369')
          ? () => undefined
          : (stryCov_9fa48('1369'),
            (batch) =>
              this.doSend(
                batch,
                stryMutAct_9fa48('1370')
                  ? {}
                  : (stryCov_9fa48('1370'),
                    {
                      msgtype: stryMutAct_9fa48('1371')
                        ? ''
                        : (stryCov_9fa48('1371'), 'actionCard'),
                      actionCard: card,
                    })
              ))
      );
    }
  }
  private async sendInBatches(
    userIds: string[],
    sendFn: (batch: string[]) => Promise<Partial<SendResult>>
  ): Promise<SendResult> {
    if (stryMutAct_9fa48('1372')) {
      {
      }
    } else {
      stryCov_9fa48('1372');
      const result: SendResult = stryMutAct_9fa48('1373')
        ? {}
        : (stryCov_9fa48('1373'),
          {
            taskId: stryMutAct_9fa48('1374') ? 'Stryker was here!' : (stryCov_9fa48('1374'), ''),
            successCount: 0,
            failedUserIds: stryMutAct_9fa48('1375')
              ? ['Stryker was here']
              : (stryCov_9fa48('1375'), []),
            errors: stryMutAct_9fa48('1376') ? ['Stryker was here'] : (stryCov_9fa48('1376'), []),
          });
      for (
        let i = 0;
        stryMutAct_9fa48('1379')
          ? i >= userIds.length
          : stryMutAct_9fa48('1378')
            ? i <= userIds.length
            : stryMutAct_9fa48('1377')
              ? false
              : (stryCov_9fa48('1377', '1378', '1379'), i < userIds.length);
        stryMutAct_9fa48('1380')
          ? (i -= this.BATCH_SIZE)
          : (stryCov_9fa48('1380'), (i += this.BATCH_SIZE))
      ) {
        if (stryMutAct_9fa48('1381')) {
          {
          }
        } else {
          stryCov_9fa48('1381');
          const batch = stryMutAct_9fa48('1382')
            ? userIds
            : (stryCov_9fa48('1382'),
              userIds.slice(
                i,
                stryMutAct_9fa48('1383')
                  ? i - this.BATCH_SIZE
                  : (stryCov_9fa48('1383'), i + this.BATCH_SIZE)
              ));
          const batchResult = await sendFn(batch);
          stryMutAct_9fa48('1384')
            ? (result.successCount -= batchResult.successCount ?? 0)
            : (stryCov_9fa48('1384'),
              (result.successCount += stryMutAct_9fa48('1385')
                ? batchResult.successCount && 0
                : (stryCov_9fa48('1385'), batchResult.successCount ?? 0)));
          result.failedUserIds.push(
            ...(stryMutAct_9fa48('1386')
              ? batchResult.failedUserIds && []
              : (stryCov_9fa48('1386'),
                batchResult.failedUserIds ??
                  (stryMutAct_9fa48('1387') ? ['Stryker was here'] : (stryCov_9fa48('1387'), []))))
          );
          stryMutAct_9fa48('1388')
            ? result.errors.push(...(batchResult.errors ?? []))
            : (stryCov_9fa48('1388'),
              result.errors?.push(
                ...(stryMutAct_9fa48('1389')
                  ? batchResult.errors && []
                  : (stryCov_9fa48('1389'),
                    batchResult.errors ??
                      (stryMutAct_9fa48('1390')
                        ? ['Stryker was here']
                        : (stryCov_9fa48('1390'), []))))
              ));
          if (
            stryMutAct_9fa48('1392')
              ? false
              : stryMutAct_9fa48('1391')
                ? true
                : (stryCov_9fa48('1391', '1392'), batchResult.taskId)
          )
            result.taskId = batchResult.taskId;
          if (
            stryMutAct_9fa48('1396')
              ? i + this.BATCH_SIZE >= userIds.length
              : stryMutAct_9fa48('1395')
                ? i + this.BATCH_SIZE <= userIds.length
                : stryMutAct_9fa48('1394')
                  ? false
                  : stryMutAct_9fa48('1393')
                    ? true
                    : (stryCov_9fa48('1393', '1394', '1395', '1396'),
                      (stryMutAct_9fa48('1397')
                        ? i - this.BATCH_SIZE
                        : (stryCov_9fa48('1397'), i + this.BATCH_SIZE)) < userIds.length)
          ) {
            if (stryMutAct_9fa48('1398')) {
              {
              }
            } else {
              stryCov_9fa48('1398');
              await new Promise(
                stryMutAct_9fa48('1399')
                  ? () => undefined
                  : (stryCov_9fa48('1399'), (resolve) => setTimeout(resolve, 500))
              );
            }
          }
        }
      }
      return result;
    }
  }
  private async doSend(
    userIds: string[],
    msg: Record<string, unknown>
  ): Promise<Partial<SendResult>> {
    if (stryMutAct_9fa48('1400')) {
      {
      }
    } else {
      stryCov_9fa48('1400');
      const agentId = process.env.DINGTALK_AGENT_ID;
      if (
        stryMutAct_9fa48('1403')
          ? false
          : stryMutAct_9fa48('1402')
            ? true
            : stryMutAct_9fa48('1401')
              ? agentId
              : (stryCov_9fa48('1401', '1402', '1403'), !agentId)
      ) {
        if (stryMutAct_9fa48('1404')) {
          {
          }
        } else {
          stryCov_9fa48('1404');
          return stryMutAct_9fa48('1405')
            ? {}
            : (stryCov_9fa48('1405'),
              {
                taskId: stryMutAct_9fa48('1406')
                  ? 'Stryker was here!'
                  : (stryCov_9fa48('1406'), ''),
                successCount: 0,
                failedUserIds: userIds,
                errors: userIds.map(
                  stryMutAct_9fa48('1407')
                    ? () => undefined
                    : (stryCov_9fa48('1407'),
                      (uid) =>
                        stryMutAct_9fa48('1408')
                          ? {}
                          : (stryCov_9fa48('1408'),
                            {
                              userId: uid,
                              error: stryMutAct_9fa48('1409')
                                ? ''
                                : (stryCov_9fa48('1409'), 'DINGTALK_AGENT_ID must be set'),
                            }))
                ),
              });
        }
      }
      for (
        let attempt = 1;
        stryMutAct_9fa48('1412')
          ? attempt > 3
          : stryMutAct_9fa48('1411')
            ? attempt < 3
            : stryMutAct_9fa48('1410')
              ? false
              : (stryCov_9fa48('1410', '1411', '1412'), attempt <= 3);
        stryMutAct_9fa48('1413') ? attempt-- : (stryCov_9fa48('1413'), attempt++)
      ) {
        if (stryMutAct_9fa48('1414')) {
          {
          }
        } else {
          stryCov_9fa48('1414');
          const token = await tokenManager.getAccessToken();
          const url = stryMutAct_9fa48('1415')
            ? ``
            : (stryCov_9fa48('1415'),
              `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`);
          const response = await fetch(
            url,
            stryMutAct_9fa48('1416')
              ? {}
              : (stryCov_9fa48('1416'),
                {
                  method: stryMutAct_9fa48('1417') ? '' : (stryCov_9fa48('1417'), 'POST'),
                  headers: stryMutAct_9fa48('1418')
                    ? {}
                    : (stryCov_9fa48('1418'),
                      {
                        'Content-Type': stryMutAct_9fa48('1419')
                          ? ''
                          : (stryCov_9fa48('1419'), 'application/json'),
                      }),
                  body: JSON.stringify(
                    stryMutAct_9fa48('1420')
                      ? {}
                      : (stryCov_9fa48('1420'),
                        {
                          agent_id: agentId,
                          userid_list: userIds.join(
                            stryMutAct_9fa48('1421') ? '' : (stryCov_9fa48('1421'), ',')
                          ),
                          msg,
                        })
                  ),
                })
          );
          const data = (await response.json()) as {
            errcode: number;
            errmsg: string;
            task_id?: number | string;
          };
          if (
            stryMutAct_9fa48('1424')
              ? data.errcode === 400014 && data.errcode === 40014
              : stryMutAct_9fa48('1423')
                ? false
                : stryMutAct_9fa48('1422')
                  ? true
                  : (stryCov_9fa48('1422', '1423', '1424'),
                    (stryMutAct_9fa48('1426')
                      ? data.errcode !== 400014
                      : stryMutAct_9fa48('1425')
                        ? false
                        : (stryCov_9fa48('1425', '1426'), data.errcode === 400014)) ||
                      (stryMutAct_9fa48('1428')
                        ? data.errcode !== 40014
                        : stryMutAct_9fa48('1427')
                          ? false
                          : (stryCov_9fa48('1427', '1428'), data.errcode === 40014)))
          ) {
            if (stryMutAct_9fa48('1429')) {
              {
              }
            } else {
              stryCov_9fa48('1429');
              tokenManager.invalidateToken();
              continue;
            }
          }
          if (
            stryMutAct_9fa48('1432')
              ? data.errcode === 0
              : stryMutAct_9fa48('1431')
                ? false
                : stryMutAct_9fa48('1430')
                  ? true
                  : (stryCov_9fa48('1430', '1431', '1432'), data.errcode !== 0)
          ) {
            if (stryMutAct_9fa48('1433')) {
              {
              }
            } else {
              stryCov_9fa48('1433');
              return stryMutAct_9fa48('1434')
                ? {}
                : (stryCov_9fa48('1434'),
                  {
                    taskId: stryMutAct_9fa48('1435')
                      ? 'Stryker was here!'
                      : (stryCov_9fa48('1435'), ''),
                    successCount: 0,
                    failedUserIds: userIds,
                    errors: userIds.map(
                      stryMutAct_9fa48('1436')
                        ? () => undefined
                        : (stryCov_9fa48('1436'),
                          (uid) =>
                            stryMutAct_9fa48('1437')
                              ? {}
                              : (stryCov_9fa48('1437'),
                                {
                                  userId: uid,
                                  error: data.errmsg,
                                }))
                    ),
                  });
            }
          }
          return stryMutAct_9fa48('1438')
            ? {}
            : (stryCov_9fa48('1438'),
              {
                taskId: String(
                  stryMutAct_9fa48('1439')
                    ? data.task_id && ''
                    : (stryCov_9fa48('1439'),
                      data.task_id ??
                        (stryMutAct_9fa48('1440')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('1440'), '')))
                ),
                successCount: userIds.length,
                failedUserIds: stryMutAct_9fa48('1441')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('1441'), []),
              });
        }
      }
      return stryMutAct_9fa48('1442')
        ? {}
        : (stryCov_9fa48('1442'),
          {
            taskId: stryMutAct_9fa48('1443') ? 'Stryker was here!' : (stryCov_9fa48('1443'), ''),
            successCount: 0,
            failedUserIds: userIds,
          });
    }
  }
}
export const messageSender = new DingTalkMessageSender();
