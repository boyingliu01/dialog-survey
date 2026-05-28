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
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySignature } from '../integrations/dingtalk/middleware.js';
import { error, info } from '../utils/logger.js';
interface DingTalkMessage {
  msgtype: 'text' | 'markdown' | 'voice' | 'image' | 'link' | 'actionCard' | 'feedCard';
  text?: {
    content: string;
  };
  markdown?: {
    title: string;
    text: string;
  };
  voice?: {
    media_id: string;
  };
  image?: {
    media_id: string;
  };
  link?: {
    messageUrl: string;
    picUrl: string;
    title: string;
    text: string;
  };
  senderId?: string;
  timestamp?: number;
  signature?: string;
  event?: {
    msgtype: string;
  };
}
function parseDingTalkMessage(body: DingTalkMessage): {
  userId: string;
  content: string;
  messageType: string;
  isVoice: boolean;
} | null {
  if (stryMutAct_9fa48('1020')) {
    {
    }
  } else {
    stryCov_9fa48('1020');
    try {
      if (stryMutAct_9fa48('1021')) {
        {
        }
      } else {
        stryCov_9fa48('1021');
        const messageType = body.msgtype;
        let content = stryMutAct_9fa48('1022') ? 'Stryker was here!' : (stryCov_9fa48('1022'), '');
        let isVoice = stryMutAct_9fa48('1023') ? true : (stryCov_9fa48('1023'), false);
        if (
          stryMutAct_9fa48('1026')
            ? messageType === 'text' || body.text
            : stryMutAct_9fa48('1025')
              ? false
              : stryMutAct_9fa48('1024')
                ? true
                : (stryCov_9fa48('1024', '1025', '1026'),
                  (stryMutAct_9fa48('1028')
                    ? messageType !== 'text'
                    : stryMutAct_9fa48('1027')
                      ? true
                      : (stryCov_9fa48('1027', '1028'),
                        messageType ===
                          (stryMutAct_9fa48('1029') ? '' : (stryCov_9fa48('1029'), 'text')))) &&
                    body.text)
        ) {
          if (stryMutAct_9fa48('1030')) {
            {
            }
          } else {
            stryCov_9fa48('1030');
            content = body.text.content;
          }
        } else if (
          stryMutAct_9fa48('1033')
            ? messageType === 'voice' || body.voice
            : stryMutAct_9fa48('1032')
              ? false
              : stryMutAct_9fa48('1031')
                ? true
                : (stryCov_9fa48('1031', '1032', '1033'),
                  (stryMutAct_9fa48('1035')
                    ? messageType !== 'voice'
                    : stryMutAct_9fa48('1034')
                      ? true
                      : (stryCov_9fa48('1034', '1035'),
                        messageType ===
                          (stryMutAct_9fa48('1036') ? '' : (stryCov_9fa48('1036'), 'voice')))) &&
                    body.voice)
        ) {
          if (stryMutAct_9fa48('1037')) {
            {
            }
          } else {
            stryCov_9fa48('1037');
            content = body.voice.media_id;
            isVoice = stryMutAct_9fa48('1038') ? false : (stryCov_9fa48('1038'), true);
          }
        } else if (
          stryMutAct_9fa48('1041')
            ? body.event.msgtype
            : stryMutAct_9fa48('1040')
              ? false
              : stryMutAct_9fa48('1039')
                ? true
                : (stryCov_9fa48('1039', '1040', '1041'), body.event?.msgtype)
        ) {
          if (stryMutAct_9fa48('1042')) {
            {
            }
          } else {
            stryCov_9fa48('1042');
            return null;
          }
        }
        return stryMutAct_9fa48('1043')
          ? {}
          : (stryCov_9fa48('1043'),
            {
              userId: stryMutAct_9fa48('1046')
                ? body.senderId && 'unknown'
                : stryMutAct_9fa48('1045')
                  ? false
                  : stryMutAct_9fa48('1044')
                    ? true
                    : (stryCov_9fa48('1044', '1045', '1046'),
                      body.senderId ||
                        (stryMutAct_9fa48('1047') ? '' : (stryCov_9fa48('1047'), 'unknown'))),
              content: stryMutAct_9fa48('1048') ? content : (stryCov_9fa48('1048'), content.trim()),
              messageType,
              isVoice,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('1049')) {
        {
        }
      } else {
        stryCov_9fa48('1049');
        error(
          stryMutAct_9fa48('1050')
            ? ''
            : (stryCov_9fa48('1050'), 'Failed to parse DingTalk message'),
          stryMutAct_9fa48('1051')
            ? {}
            : (stryCov_9fa48('1051'),
              {
                error:
                  e instanceof Error
                    ? e.message
                    : stryMutAct_9fa48('1052')
                      ? ''
                      : (stryCov_9fa48('1052'), 'Unknown'),
              })
        );
        return null;
      }
    }
  }
}
export async function webhookRoutes(fastify: FastifyInstance) {
  if (stryMutAct_9fa48('1053')) {
    {
    }
  } else {
    stryCov_9fa48('1053');
    fastify.post<{
      Body: DingTalkMessage;
    }>(
      stryMutAct_9fa48('1054') ? '' : (stryCov_9fa48('1054'), '/webhook'),
      stryMutAct_9fa48('1055')
        ? {}
        : (stryCov_9fa48('1055'),
          {
            preHandler: async (
              request: FastifyRequest<{
                Body: DingTalkMessage;
              }>,
              reply: FastifyReply
            ) => {
              if (stryMutAct_9fa48('1056')) {
                {
                }
              } else {
                stryCov_9fa48('1056');
                const { timestamp, signature } = request.query as {
                  timestamp?: string;
                  signature?: string;
                };
                const secret = process.env.DINGTALK_SECRET;
                if (
                  stryMutAct_9fa48('1059')
                    ? (!timestamp || !signature) && !secret
                    : stryMutAct_9fa48('1058')
                      ? false
                      : stryMutAct_9fa48('1057')
                        ? true
                        : (stryCov_9fa48('1057', '1058', '1059'),
                          (stryMutAct_9fa48('1061')
                            ? !timestamp && !signature
                            : stryMutAct_9fa48('1060')
                              ? false
                              : (stryCov_9fa48('1060', '1061'),
                                (stryMutAct_9fa48('1062')
                                  ? timestamp
                                  : (stryCov_9fa48('1062'), !timestamp)) ||
                                  (stryMutAct_9fa48('1063')
                                    ? signature
                                    : (stryCov_9fa48('1063'), !signature)))) ||
                            (stryMutAct_9fa48('1064') ? secret : (stryCov_9fa48('1064'), !secret)))
                ) {
                  if (stryMutAct_9fa48('1065')) {
                    {
                    }
                  } else {
                    stryCov_9fa48('1065');
                    return reply.status(401).send(
                      stryMutAct_9fa48('1066')
                        ? {}
                        : (stryCov_9fa48('1066'),
                          {
                            error: stryMutAct_9fa48('1067')
                              ? ''
                              : (stryCov_9fa48('1067'), 'Missing parameters'),
                          })
                    );
                  }
                }
                const timestampNum = Number.parseInt(timestamp, 10);
                if (
                  stryMutAct_9fa48('1070')
                    ? false
                    : stryMutAct_9fa48('1069')
                      ? true
                      : stryMutAct_9fa48('1068')
                        ? verifySignature(timestampNum, secret, signature)
                        : (stryCov_9fa48('1068', '1069', '1070'),
                          !verifySignature(timestampNum, secret, signature))
                ) {
                  if (stryMutAct_9fa48('1071')) {
                    {
                    }
                  } else {
                    stryCov_9fa48('1071');
                    return reply.status(401).send(
                      stryMutAct_9fa48('1072')
                        ? {}
                        : (stryCov_9fa48('1072'),
                          {
                            error: stryMutAct_9fa48('1073')
                              ? ''
                              : (stryCov_9fa48('1073'), 'Invalid signature'),
                          })
                    );
                  }
                }
              }
            },
          }),
      async (
        request: FastifyRequest<{
          Body: DingTalkMessage;
        }>,
        reply: FastifyReply
      ) => {
        if (stryMutAct_9fa48('1074')) {
          {
          }
        } else {
          stryCov_9fa48('1074');
          const body = request.body;
          info(
            stryMutAct_9fa48('1075') ? '' : (stryCov_9fa48('1075'), 'Received DingTalk webhook'),
            stryMutAct_9fa48('1076')
              ? {}
              : (stryCov_9fa48('1076'),
                {
                  msgtype: body.msgtype,
                  senderId: body.senderId,
                })
          );
          const parsed = parseDingTalkMessage(body);
          if (
            stryMutAct_9fa48('1079')
              ? false
              : stryMutAct_9fa48('1078')
                ? true
                : stryMutAct_9fa48('1077')
                  ? parsed
                  : (stryCov_9fa48('1077', '1078', '1079'), !parsed)
          ) {
            if (stryMutAct_9fa48('1080')) {
              {
              }
            } else {
              stryCov_9fa48('1080');
              return reply.status(200).send(
                stryMutAct_9fa48('1081')
                  ? {}
                  : (stryCov_9fa48('1081'),
                    {
                      result: stryMutAct_9fa48('1082') ? '' : (stryCov_9fa48('1082'), 'ignored'),
                    })
              );
            }
          }
          info(
            stryMutAct_9fa48('1083') ? '' : (stryCov_9fa48('1083'), 'Message parsed'),
            stryMutAct_9fa48('1084')
              ? {}
              : (stryCov_9fa48('1084'),
                {
                  userId: parsed.userId,
                  contentLength: parsed.content.length,
                  messageType: parsed.messageType,
                  isVoice: parsed.isVoice,
                })
          );
          return reply.status(200).send(
            stryMutAct_9fa48('1085')
              ? {}
              : (stryCov_9fa48('1085'),
                {
                  result: stryMutAct_9fa48('1086') ? '' : (stryCov_9fa48('1086'), 'success'),
                })
          );
        }
      }
    );
  }
}
export interface DingTalkMessageEvent {
  userId: string;
  content: string;
  messageType: string;
  isVoice: boolean;
  timestamp: Date;
}
