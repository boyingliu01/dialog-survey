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
import { WebSocket } from 'ws';
import { debug, error, info } from '../../utils/logger.js';
export interface DingTalkStreamConfig {
  clientId: string;
  clientSecret: string;
  agentId?: string;
}
export interface ConnectionToken {
  endpoint: string;
  ticket: string;
}
export interface DingTalkMessage {
  specVersion: string;
  type: string;
  headers: {
    topic: string;
    messageId: string;
    time: string;
  };
  data: string;
}
export interface DingTalkMessageData {
  senderStaffId: string;
  content: string;
  sessionWebhook: string;
}
export interface AckResponse {
  code: number;
  headers: {
    messageId: string;
  };
  message: string;
  data: string;
}
export interface StreamClientOptions {
  maxReconnectAttempts?: number;
}
export type EventHandler = (data: unknown) => void;
export class DingTalkStreamClient {
  private config: DingTalkStreamConfig;
  private options: StreamClientOptions;
  private ws: WebSocket | null = null;
  private connected = stryMutAct_9fa48('1481') ? true : (stryCov_9fa48('1481'), false);
  private reconnectAttempts = 0;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  constructor(config: DingTalkStreamConfig, options: StreamClientOptions = {}) {
    if (stryMutAct_9fa48('1482')) {
      {
      }
    } else {
      stryCov_9fa48('1482');
      if (
        stryMutAct_9fa48('1485')
          ? false
          : stryMutAct_9fa48('1484')
            ? true
            : stryMutAct_9fa48('1483')
              ? config.clientId
              : (stryCov_9fa48('1483', '1484', '1485'), !config.clientId)
      ) {
        if (stryMutAct_9fa48('1486')) {
          {
          }
        } else {
          stryCov_9fa48('1486');
          throw new Error(
            stryMutAct_9fa48('1487') ? '' : (stryCov_9fa48('1487'), 'clientId is required')
          );
        }
      }
      if (
        stryMutAct_9fa48('1490')
          ? false
          : stryMutAct_9fa48('1489')
            ? true
            : stryMutAct_9fa48('1488')
              ? config.clientSecret
              : (stryCov_9fa48('1488', '1489', '1490'), !config.clientSecret)
      ) {
        if (stryMutAct_9fa48('1491')) {
          {
          }
        } else {
          stryCov_9fa48('1491');
          throw new Error(
            stryMutAct_9fa48('1492') ? '' : (stryCov_9fa48('1492'), 'clientSecret is required')
          );
        }
      }
      this.config = config;
      this.options = stryMutAct_9fa48('1493')
        ? {}
        : (stryCov_9fa48('1493'),
          {
            maxReconnectAttempts: stryMutAct_9fa48('1494')
              ? options.maxReconnectAttempts && 3
              : (stryCov_9fa48('1494'), options.maxReconnectAttempts ?? 3),
          });
    }
  }

  /**
   * Create client from environment variables
   */
  static fromEnv(): DingTalkStreamClient {
    if (stryMutAct_9fa48('1495')) {
      {
      }
    } else {
      stryCov_9fa48('1495');
      const clientId = stryMutAct_9fa48('1498')
        ? process.env.DINGTALK_CLIENT_ID && ''
        : stryMutAct_9fa48('1497')
          ? false
          : stryMutAct_9fa48('1496')
            ? true
            : (stryCov_9fa48('1496', '1497', '1498'),
              process.env.DINGTALK_CLIENT_ID ||
                (stryMutAct_9fa48('1499') ? 'Stryker was here!' : (stryCov_9fa48('1499'), '')));
      const clientSecret = stryMutAct_9fa48('1502')
        ? process.env.DINGTALK_CLIENT_SECRET && ''
        : stryMutAct_9fa48('1501')
          ? false
          : stryMutAct_9fa48('1500')
            ? true
            : (stryCov_9fa48('1500', '1501', '1502'),
              process.env.DINGTALK_CLIENT_SECRET ||
                (stryMutAct_9fa48('1503') ? 'Stryker was here!' : (stryCov_9fa48('1503'), '')));
      const agentId = process.env.DINGTALK_AGENT_ID;
      return new DingTalkStreamClient(
        stryMutAct_9fa48('1504')
          ? {}
          : (stryCov_9fa48('1504'),
            {
              clientId,
              clientSecret,
              agentId,
            })
      );
    }
  }

  /**
   * Get connection token from DingTalk API
   */
  async getConnectionToken(): Promise<ConnectionToken> {
    if (stryMutAct_9fa48('1505')) {
      {
      }
    } else {
      stryCov_9fa48('1505');
      const url = stryMutAct_9fa48('1506')
        ? ''
        : (stryCov_9fa48('1506'), 'https://api.dingtalk.com/v1.0/gateway/connections/open');
      const body = stryMutAct_9fa48('1507')
        ? {}
        : (stryCov_9fa48('1507'),
          {
            clientId: this.config.clientId,
            clientSecret: this.config.clientSecret,
            subscriptions: stryMutAct_9fa48('1508')
              ? []
              : (stryCov_9fa48('1508'),
                [
                  stryMutAct_9fa48('1509')
                    ? {}
                    : (stryCov_9fa48('1509'),
                      {
                        topic: stryMutAct_9fa48('1510')
                          ? ''
                          : (stryCov_9fa48('1510'), '/v1.0/im/bot/messages/get'),
                        type: stryMutAct_9fa48('1511') ? '' : (stryCov_9fa48('1511'), 'CALLBACK'),
                      }),
                ]),
            ua: stryMutAct_9fa48('1512') ? '' : (stryCov_9fa48('1512'), 'bot'),
          });
      try {
        if (stryMutAct_9fa48('1513')) {
          {
          }
        } else {
          stryCov_9fa48('1513');
          const response = await fetch(
            url,
            stryMutAct_9fa48('1514')
              ? {}
              : (stryCov_9fa48('1514'),
                {
                  method: stryMutAct_9fa48('1515') ? '' : (stryCov_9fa48('1515'), 'POST'),
                  headers: stryMutAct_9fa48('1516')
                    ? {}
                    : (stryCov_9fa48('1516'),
                      {
                        'Content-Type': stryMutAct_9fa48('1517')
                          ? ''
                          : (stryCov_9fa48('1517'), 'application/json'),
                      }),
                  body: JSON.stringify(body),
                })
          );
          if (
            stryMutAct_9fa48('1520')
              ? false
              : stryMutAct_9fa48('1519')
                ? true
                : stryMutAct_9fa48('1518')
                  ? response.ok
                  : (stryCov_9fa48('1518', '1519', '1520'), !response.ok)
          ) {
            if (stryMutAct_9fa48('1521')) {
              {
              }
            } else {
              stryCov_9fa48('1521');
              throw new Error(
                stryMutAct_9fa48('1522')
                  ? ``
                  : (stryCov_9fa48('1522'),
                    `Failed to get connection token: ${response.status} ${response.statusText}`)
              );
            }
          }
          const data = (await response.json()) as ConnectionToken;
          if (
            stryMutAct_9fa48('1525')
              ? !data.endpoint && !data.ticket
              : stryMutAct_9fa48('1524')
                ? false
                : stryMutAct_9fa48('1523')
                  ? true
                  : (stryCov_9fa48('1523', '1524', '1525'),
                    (stryMutAct_9fa48('1526')
                      ? data.endpoint
                      : (stryCov_9fa48('1526'), !data.endpoint)) ||
                      (stryMutAct_9fa48('1527')
                        ? data.ticket
                        : (stryCov_9fa48('1527'), !data.ticket)))
          ) {
            if (stryMutAct_9fa48('1528')) {
              {
              }
            } else {
              stryCov_9fa48('1528');
              throw new Error(
                stryMutAct_9fa48('1529')
                  ? ''
                  : (stryCov_9fa48('1529'), 'endpoint or ticket missing in response')
              );
            }
          }
          debug(
            stryMutAct_9fa48('1530') ? '' : (stryCov_9fa48('1530'), 'Got connection token'),
            stryMutAct_9fa48('1531')
              ? {}
              : (stryCov_9fa48('1531'),
                {
                  endpoint: data.endpoint,
                })
          );
          return data;
        }
      } catch (err) {
        if (stryMutAct_9fa48('1532')) {
          {
          }
        } else {
          stryCov_9fa48('1532');
          const errMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('1533')
                ? ''
                : (stryCov_9fa48('1533'), 'Unknown error');
          error(
            stryMutAct_9fa48('1534')
              ? ''
              : (stryCov_9fa48('1534'), 'Failed to get connection token'),
            stryMutAct_9fa48('1535')
              ? {}
              : (stryCov_9fa48('1535'),
                {
                  error: errMsg,
                })
          );
          throw err;
        }
      }
    }
  }

  /**
   * Build WebSocket URL from connection token
   */
  buildWebSocketUrl(token: ConnectionToken): string {
    if (stryMutAct_9fa48('1536')) {
      {
      }
    } else {
      stryCov_9fa48('1536');
      return stryMutAct_9fa48('1537')
        ? ``
        : (stryCov_9fa48('1537'), `${token.endpoint}?ticket=${token.ticket}`);
    }
  }

  /**
   * Connect to DingTalk Stream
   */
  async connect(): Promise<void> {
    if (stryMutAct_9fa48('1538')) {
      {
      }
    } else {
      stryCov_9fa48('1538');
      if (
        stryMutAct_9fa48('1541')
          ? this.connected || this.ws
          : stryMutAct_9fa48('1540')
            ? false
            : stryMutAct_9fa48('1539')
              ? true
              : (stryCov_9fa48('1539', '1540', '1541'), this.connected && this.ws)
      ) {
        if (stryMutAct_9fa48('1542')) {
          {
          }
        } else {
          stryCov_9fa48('1542');
          info(stryMutAct_9fa48('1543') ? '' : (stryCov_9fa48('1543'), 'Already connected'));
          return;
        }
      }
      const token = await this.getConnectionToken();
      const wsUrl = this.buildWebSocketUrl(token);
      info(
        stryMutAct_9fa48('1544') ? '' : (stryCov_9fa48('1544'), 'Connecting to DingTalk Stream'),
        stryMutAct_9fa48('1545')
          ? {}
          : (stryCov_9fa48('1545'),
            {
              endpoint: token.endpoint,
            })
      );
      this.ws = new WebSocket(wsUrl);
      this.ws.on(stryMutAct_9fa48('1546') ? '' : (stryCov_9fa48('1546'), 'open'), () => {
        if (stryMutAct_9fa48('1547')) {
          {
          }
        } else {
          stryCov_9fa48('1547');
          this.connected = stryMutAct_9fa48('1548') ? false : (stryCov_9fa48('1548'), true);
          this.reconnectAttempts = 0;
          info(
            stryMutAct_9fa48('1549') ? '' : (stryCov_9fa48('1549'), 'Connected to DingTalk Stream')
          );
          this.emit(stryMutAct_9fa48('1550') ? '' : (stryCov_9fa48('1550'), 'connected'), {});
        }
      });
      this.ws.on(
        stryMutAct_9fa48('1551') ? '' : (stryCov_9fa48('1551'), 'message'),
        (data: Buffer) => {
          if (stryMutAct_9fa48('1552')) {
            {
            }
          } else {
            stryCov_9fa48('1552');
            this.handleMessage(data);
          }
        }
      );
      this.ws.on(stryMutAct_9fa48('1553') ? '' : (stryCov_9fa48('1553'), 'error'), (err: Error) => {
        if (stryMutAct_9fa48('1554')) {
          {
          }
        } else {
          stryCov_9fa48('1554');
          error(
            stryMutAct_9fa48('1555') ? '' : (stryCov_9fa48('1555'), 'WebSocket error'),
            stryMutAct_9fa48('1556')
              ? {}
              : (stryCov_9fa48('1556'),
                {
                  error: err.message,
                })
          );
          this.emit(stryMutAct_9fa48('1557') ? '' : (stryCov_9fa48('1557'), 'error'), err);
        }
      });
      this.ws.on(
        stryMutAct_9fa48('1558') ? '' : (stryCov_9fa48('1558'), 'close'),
        (code: number, reason: Buffer) => {
          if (stryMutAct_9fa48('1559')) {
            {
            }
          } else {
            stryCov_9fa48('1559');
            this.connected = stryMutAct_9fa48('1560') ? true : (stryCov_9fa48('1560'), false);
            info(
              stryMutAct_9fa48('1561')
                ? ''
                : (stryCov_9fa48('1561'), 'WebSocket connection closed'),
              stryMutAct_9fa48('1562')
                ? {}
                : (stryCov_9fa48('1562'),
                  {
                    code,
                    reason: reason.toString(),
                  })
            );
            this.emit(
              stryMutAct_9fa48('1563') ? '' : (stryCov_9fa48('1563'), 'disconnected'),
              stryMutAct_9fa48('1564')
                ? {}
                : (stryCov_9fa48('1564'),
                  {
                    code,
                    reason: reason.toString(),
                  })
            );
            const maxAttempts = stryMutAct_9fa48('1565')
              ? this.options.maxReconnectAttempts && 3
              : (stryCov_9fa48('1565'), this.options.maxReconnectAttempts ?? 3);
            if (
              stryMutAct_9fa48('1569')
                ? this.reconnectAttempts >= maxAttempts
                : stryMutAct_9fa48('1568')
                  ? this.reconnectAttempts <= maxAttempts
                  : stryMutAct_9fa48('1567')
                    ? false
                    : stryMutAct_9fa48('1566')
                      ? true
                      : (stryCov_9fa48('1566', '1567', '1568', '1569'),
                        this.reconnectAttempts < maxAttempts)
            ) {
              if (stryMutAct_9fa48('1570')) {
                {
                }
              } else {
                stryCov_9fa48('1570');
                this.reconnect();
              }
            }
          }
        }
      );
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    if (stryMutAct_9fa48('1571')) {
      {
      }
    } else {
      stryCov_9fa48('1571');
      try {
        if (stryMutAct_9fa48('1572')) {
          {
          }
        } else {
          stryCov_9fa48('1572');
          const message = this.parseMessage(data.toString());
          info(
            stryMutAct_9fa48('1573') ? '' : (stryCov_9fa48('1573'), 'Received message'),
            stryMutAct_9fa48('1574')
              ? {}
              : (stryCov_9fa48('1574'),
                {
                  topic: message.headers.topic,
                  messageId: message.headers.messageId,
                })
          );
          this.emit(stryMutAct_9fa48('1575') ? '' : (stryCov_9fa48('1575'), 'message'), message);
          this.sendAck(message.headers.messageId);
        }
      } catch (err) {
        if (stryMutAct_9fa48('1576')) {
          {
          }
        } else {
          stryCov_9fa48('1576');
          const errMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('1577')
                ? ''
                : (stryCov_9fa48('1577'), 'Unknown error');
          error(
            stryMutAct_9fa48('1578') ? '' : (stryCov_9fa48('1578'), 'Failed to handle message'),
            stryMutAct_9fa48('1579')
              ? {}
              : (stryCov_9fa48('1579'),
                {
                  error: errMsg,
                })
          );
          this.emit(stryMutAct_9fa48('1580') ? '' : (stryCov_9fa48('1580'), 'error'), err);
        }
      }
    }
  }

  /**
   * Parse incoming message
   */
  parseMessage(data: string): DingTalkMessage {
    if (stryMutAct_9fa48('1581')) {
      {
      }
    } else {
      stryCov_9fa48('1581');
      return JSON.parse(data) as DingTalkMessage;
    }
  }

  /**
   * Build ACK response
   */
  buildAck(messageId: string): AckResponse {
    if (stryMutAct_9fa48('1582')) {
      {
      }
    } else {
      stryCov_9fa48('1582');
      return stryMutAct_9fa48('1583')
        ? {}
        : (stryCov_9fa48('1583'),
          {
            code: 200,
            headers: stryMutAct_9fa48('1584')
              ? {}
              : (stryCov_9fa48('1584'),
                {
                  messageId,
                }),
            message: stryMutAct_9fa48('1585') ? '' : (stryCov_9fa48('1585'), 'OK'),
            data: stryMutAct_9fa48('1586') ? '' : (stryCov_9fa48('1586'), '{}'),
          });
    }
  }

  /**
   * Send ACK response
   */
  private sendAck(messageId: string): void {
    if (stryMutAct_9fa48('1587')) {
      {
      }
    } else {
      stryCov_9fa48('1587');
      if (
        stryMutAct_9fa48('1590')
          ? !this.ws && this.ws.readyState !== WebSocket.OPEN
          : stryMutAct_9fa48('1589')
            ? false
            : stryMutAct_9fa48('1588')
              ? true
              : (stryCov_9fa48('1588', '1589', '1590'),
                (stryMutAct_9fa48('1591') ? this.ws : (stryCov_9fa48('1591'), !this.ws)) ||
                  (stryMutAct_9fa48('1593')
                    ? this.ws.readyState === WebSocket.OPEN
                    : stryMutAct_9fa48('1592')
                      ? false
                      : (stryCov_9fa48('1592', '1593'), this.ws.readyState !== WebSocket.OPEN)))
      ) {
        if (stryMutAct_9fa48('1594')) {
          {
          }
        } else {
          stryCov_9fa48('1594');
          return;
        }
      }
      const ack = this.buildAck(messageId);
      this.ws.send(JSON.stringify(ack));
      debug(
        stryMutAct_9fa48('1595') ? '' : (stryCov_9fa48('1595'), 'Sent ACK'),
        stryMutAct_9fa48('1596')
          ? {}
          : (stryCov_9fa48('1596'),
            {
              messageId,
            })
      );
    }
  }

  /**
   * Send text message via session webhook
   */
  async sendText(sessionWebhook: string, content: string): Promise<void> {
    if (stryMutAct_9fa48('1597')) {
      {
      }
    } else {
      stryCov_9fa48('1597');
      if (
        stryMutAct_9fa48('1600')
          ? false
          : stryMutAct_9fa48('1599')
            ? true
            : stryMutAct_9fa48('1598')
              ? sessionWebhook
              : (stryCov_9fa48('1598', '1599', '1600'), !sessionWebhook)
      ) {
        if (stryMutAct_9fa48('1601')) {
          {
          }
        } else {
          stryCov_9fa48('1601');
          throw new Error(
            stryMutAct_9fa48('1602') ? '' : (stryCov_9fa48('1602'), 'sessionWebhook is required')
          );
        }
      }
      if (
        stryMutAct_9fa48('1605')
          ? false
          : stryMutAct_9fa48('1604')
            ? true
            : stryMutAct_9fa48('1603')
              ? content
              : (stryCov_9fa48('1603', '1604', '1605'), !content)
      ) {
        if (stryMutAct_9fa48('1606')) {
          {
          }
        } else {
          stryCov_9fa48('1606');
          throw new Error(
            stryMutAct_9fa48('1607') ? '' : (stryCov_9fa48('1607'), 'content is required')
          );
        }
      }
      const body = stryMutAct_9fa48('1608')
        ? {}
        : (stryCov_9fa48('1608'),
          {
            msgtype: stryMutAct_9fa48('1609') ? '' : (stryCov_9fa48('1609'), 'text'),
            text: stryMutAct_9fa48('1610')
              ? {}
              : (stryCov_9fa48('1610'),
                {
                  content,
                }),
          });
      const response = await fetch(
        sessionWebhook,
        stryMutAct_9fa48('1611')
          ? {}
          : (stryCov_9fa48('1611'),
            {
              method: stryMutAct_9fa48('1612') ? '' : (stryCov_9fa48('1612'), 'POST'),
              headers: stryMutAct_9fa48('1613')
                ? {}
                : (stryCov_9fa48('1613'),
                  {
                    'Content-Type': stryMutAct_9fa48('1614')
                      ? ''
                      : (stryCov_9fa48('1614'), 'application/json'),
                  }),
              body: JSON.stringify(body),
            })
      );
      if (
        stryMutAct_9fa48('1617')
          ? false
          : stryMutAct_9fa48('1616')
            ? true
            : stryMutAct_9fa48('1615')
              ? response.ok
              : (stryCov_9fa48('1615', '1616', '1617'), !response.ok)
      ) {
        if (stryMutAct_9fa48('1618')) {
          {
          }
        } else {
          stryCov_9fa48('1618');
          throw new Error(
            stryMutAct_9fa48('1619')
              ? ``
              : (stryCov_9fa48('1619'),
                `Failed to send message: ${response.status} ${response.statusText}`)
          );
        }
      }
      debug(
        stryMutAct_9fa48('1620') ? '' : (stryCov_9fa48('1620'), 'Sent text message'),
        stryMutAct_9fa48('1621')
          ? {}
          : (stryCov_9fa48('1621'),
            {
              sessionWebhook,
              contentLength: content.length,
            })
      );
    }
  }

  /**
   * Reconnect to DingTalk Stream
   */
  reconnect(): void {
    if (stryMutAct_9fa48('1622')) {
      {
      }
    } else {
      stryCov_9fa48('1622');
      stryMutAct_9fa48('1623')
        ? this.reconnectAttempts--
        : (stryCov_9fa48('1623'), this.reconnectAttempts++);
      info(
        stryMutAct_9fa48('1624') ? '' : (stryCov_9fa48('1624'), 'Reconnecting'),
        stryMutAct_9fa48('1625')
          ? {}
          : (stryCov_9fa48('1625'),
            {
              attempt: this.reconnectAttempts,
            })
      );
      setTimeout(
        () => {
          if (stryMutAct_9fa48('1626')) {
            {
            }
          } else {
            stryCov_9fa48('1626');
            this.connect().catch((err) => {
              if (stryMutAct_9fa48('1627')) {
                {
                }
              } else {
                stryCov_9fa48('1627');
                const errMsg =
                  err instanceof Error
                    ? err.message
                    : stryMutAct_9fa48('1628')
                      ? ''
                      : (stryCov_9fa48('1628'), 'Unknown error');
                error(
                  stryMutAct_9fa48('1629') ? '' : (stryCov_9fa48('1629'), 'Reconnection failed'),
                  stryMutAct_9fa48('1630')
                    ? {}
                    : (stryCov_9fa48('1630'),
                      {
                        error: errMsg,
                      })
                );
              }
            });
          }
        },
        stryMutAct_9fa48('1631')
          ? 1000 / this.reconnectAttempts
          : (stryCov_9fa48('1631'), 1000 * this.reconnectAttempts)
      );
    }
  }

  /**
   * Disconnect from DingTalk Stream
   */
  disconnect(): void {
    if (stryMutAct_9fa48('1632')) {
      {
      }
    } else {
      stryCov_9fa48('1632');
      if (
        stryMutAct_9fa48('1634')
          ? false
          : stryMutAct_9fa48('1633')
            ? true
            : (stryCov_9fa48('1633', '1634'), this.ws)
      ) {
        if (stryMutAct_9fa48('1635')) {
          {
          }
        } else {
          stryCov_9fa48('1635');
          this.ws.close();
          this.ws = null;
          this.connected = stryMutAct_9fa48('1636') ? true : (stryCov_9fa48('1636'), false);
          this.reconnectAttempts = 0;
          info(
            stryMutAct_9fa48('1637')
              ? ''
              : (stryCov_9fa48('1637'), 'Disconnected from DingTalk Stream')
          );
        }
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    if (stryMutAct_9fa48('1638')) {
      {
      }
    } else {
      stryCov_9fa48('1638');
      return this.connected;
    }
  }

  /**
   * Get current reconnect attempts
   */
  getReconnectAttempts(): number {
    if (stryMutAct_9fa48('1639')) {
      {
      }
    } else {
      stryCov_9fa48('1639');
      return this.reconnectAttempts;
    }
  }

  /**
   * Get max reconnect attempts
   */
  getMaxReconnectAttempts(): number {
    if (stryMutAct_9fa48('1640')) {
      {
      }
    } else {
      stryCov_9fa48('1640');
      return stryMutAct_9fa48('1641')
        ? this.options.maxReconnectAttempts && 3
        : (stryCov_9fa48('1641'), this.options.maxReconnectAttempts ?? 3);
    }
  }

  /**
   * Register event handler
   */
  on(event: string, handler: EventHandler): void {
    if (stryMutAct_9fa48('1642')) {
      {
      }
    } else {
      stryCov_9fa48('1642');
      if (
        stryMutAct_9fa48('1645')
          ? false
          : stryMutAct_9fa48('1644')
            ? true
            : stryMutAct_9fa48('1643')
              ? this.eventHandlers.has(event)
              : (stryCov_9fa48('1643', '1644', '1645'), !this.eventHandlers.has(event))
      ) {
        if (stryMutAct_9fa48('1646')) {
          {
          }
        } else {
          stryCov_9fa48('1646');
          this.eventHandlers.set(
            event,
            stryMutAct_9fa48('1647') ? ['Stryker was here'] : (stryCov_9fa48('1647'), [])
          );
        }
      }
      const handlersForEvent = this.eventHandlers.get(event);
      if (
        stryMutAct_9fa48('1649')
          ? false
          : stryMutAct_9fa48('1648')
            ? true
            : (stryCov_9fa48('1648', '1649'), handlersForEvent)
      ) {
        if (stryMutAct_9fa48('1650')) {
          {
          }
        } else {
          stryCov_9fa48('1650');
          handlersForEvent.push(handler);
        }
      }
    }
  }

  /**
   * Unregister event handler
   */
  off(event: string, handler: EventHandler): void {
    if (stryMutAct_9fa48('1651')) {
      {
      }
    } else {
      stryCov_9fa48('1651');
      const handlers = this.eventHandlers.get(event);
      if (
        stryMutAct_9fa48('1653')
          ? false
          : stryMutAct_9fa48('1652')
            ? true
            : (stryCov_9fa48('1652', '1653'), handlers)
      ) {
        if (stryMutAct_9fa48('1654')) {
          {
          }
        } else {
          stryCov_9fa48('1654');
          const index = handlers.indexOf(handler);
          if (
            stryMutAct_9fa48('1658')
              ? index <= -1
              : stryMutAct_9fa48('1657')
                ? index >= -1
                : stryMutAct_9fa48('1656')
                  ? false
                  : stryMutAct_9fa48('1655')
                    ? true
                    : (stryCov_9fa48('1655', '1656', '1657', '1658'),
                      index > (stryMutAct_9fa48('1659') ? +1 : (stryCov_9fa48('1659'), -1)))
          ) {
            if (stryMutAct_9fa48('1660')) {
              {
              }
            } else {
              stryCov_9fa48('1660');
              handlers.splice(index, 1);
            }
          }
        }
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    if (stryMutAct_9fa48('1661')) {
      {
      }
    } else {
      stryCov_9fa48('1661');
      const handlers = this.eventHandlers.get(event);
      if (
        stryMutAct_9fa48('1663')
          ? false
          : stryMutAct_9fa48('1662')
            ? true
            : (stryCov_9fa48('1662', '1663'), handlers)
      ) {
        if (stryMutAct_9fa48('1664')) {
          {
          }
        } else {
          stryCov_9fa48('1664');
          for (const handler of handlers) {
            if (stryMutAct_9fa48('1665')) {
              {
              }
            } else {
              stryCov_9fa48('1665');
              try {
                if (stryMutAct_9fa48('1666')) {
                  {
                  }
                } else {
                  stryCov_9fa48('1666');
                  handler(data);
                }
              } catch (err) {
                if (stryMutAct_9fa48('1667')) {
                  {
                  }
                } else {
                  stryCov_9fa48('1667');
                  const errMsg =
                    err instanceof Error
                      ? err.message
                      : stryMutAct_9fa48('1668')
                        ? ''
                        : (stryCov_9fa48('1668'), 'Unknown error');
                  error(
                    stryMutAct_9fa48('1669') ? '' : (stryCov_9fa48('1669'), 'Event handler error'),
                    stryMutAct_9fa48('1670')
                      ? {}
                      : (stryCov_9fa48('1670'),
                        {
                          event,
                          error: errMsg,
                        })
                  );
                }
              }
            }
          }
        }
      }
    }
  }
}
