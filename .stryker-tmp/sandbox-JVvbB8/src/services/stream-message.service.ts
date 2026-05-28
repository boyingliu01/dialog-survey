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
import { PrismaClient } from '@prisma/client';
import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
export interface StreamMessage {
  specVersion: string;
  type: string;
  headers: {
    topic: string;
    messageId: string;
    time: string;
  };
  data: string;
}
export interface ParsedStreamMessage {
  userId: string;
  content: string;
  sessionWebhook: string;
  messageId: string;
}
export interface ProcessResult {
  success: boolean;
  response?: string;
  error?: string;
}
const MAX_RETRIES = 3;
export class StreamMessageService {
  private repo: InterviewStateRepository;
  constructor(repo?: InterviewStateRepository) {
    if (stryMutAct_9fa48('483')) {
      {
      }
    } else {
      stryCov_9fa48('483');
      this.repo = stryMutAct_9fa48('486')
        ? repo && new InterviewStateRepository()
        : stryMutAct_9fa48('485')
          ? false
          : stryMutAct_9fa48('484')
            ? true
            : (stryCov_9fa48('484', '485', '486'), repo || new InterviewStateRepository());
    }
  }
  parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
    if (stryMutAct_9fa48('487')) {
      {
      }
    } else {
      stryCov_9fa48('487');
      try {
        if (stryMutAct_9fa48('488')) {
          {
          }
        } else {
          stryCov_9fa48('488');
          info(
            stryMutAct_9fa48('489') ? '' : (stryCov_9fa48('489'), 'Parsing stream message'),
            stryMutAct_9fa48('490')
              ? {}
              : (stryCov_9fa48('490'),
                {
                  dataLength: stryMutAct_9fa48('491')
                    ? message.data.length
                    : (stryCov_9fa48('491'), message.data?.length),
                  hasData: stryMutAct_9fa48('492')
                    ? !message.data
                    : (stryCov_9fa48('492'),
                      !(stryMutAct_9fa48('493')
                        ? message.data
                        : (stryCov_9fa48('493'), !message.data))),
                })
          );
          const data = JSON.parse(message.data);
          info(
            stryMutAct_9fa48('494') ? '' : (stryCov_9fa48('494'), 'Parsed outer data'),
            stryMutAct_9fa48('495')
              ? {}
              : (stryCov_9fa48('495'),
                {
                  hasSenderStaffId: stryMutAct_9fa48('496')
                    ? !data.senderStaffId
                    : (stryCov_9fa48('496'),
                      !(stryMutAct_9fa48('497')
                        ? data.senderStaffId
                        : (stryCov_9fa48('497'), !data.senderStaffId))),
                  hasText: stryMutAct_9fa48('498')
                    ? !data.text
                    : (stryCov_9fa48('498'),
                      !(stryMutAct_9fa48('499') ? data.text : (stryCov_9fa48('499'), !data.text))),
                  hasContent: stryMutAct_9fa48('500')
                    ? !data.content
                    : (stryCov_9fa48('500'),
                      !(stryMutAct_9fa48('501')
                        ? data.content
                        : (stryCov_9fa48('501'), !data.content))),
                  hasSessionWebhook: stryMutAct_9fa48('502')
                    ? !data.sessionWebhook
                    : (stryCov_9fa48('502'),
                      !(stryMutAct_9fa48('503')
                        ? data.sessionWebhook
                        : (stryCov_9fa48('503'), !data.sessionWebhook))),
                  msgtype: data.msgtype,
                })
          );
          const content = stryMutAct_9fa48('506')
            ? (data.text?.content || data.content) && ''
            : stryMutAct_9fa48('505')
              ? false
              : stryMutAct_9fa48('504')
                ? true
                : (stryCov_9fa48('504', '505', '506'),
                  (stryMutAct_9fa48('508')
                    ? data.text?.content && data.content
                    : stryMutAct_9fa48('507')
                      ? false
                      : (stryCov_9fa48('507', '508'),
                        (stryMutAct_9fa48('509')
                          ? data.text.content
                          : (stryCov_9fa48('509'), data.text?.content)) || data.content)) ||
                    (stryMutAct_9fa48('510') ? 'Stryker was here!' : (stryCov_9fa48('510'), '')));
          info(
            stryMutAct_9fa48('511') ? '' : (stryCov_9fa48('511'), 'Extracted content'),
            stryMutAct_9fa48('512')
              ? {}
              : (stryCov_9fa48('512'),
                {
                  contentLength: stryMutAct_9fa48('513')
                    ? content.length
                    : (stryCov_9fa48('513'), content?.length),
                  contentPreview: stryMutAct_9fa48('515')
                    ? content.substring(0, 50)
                    : stryMutAct_9fa48('514')
                      ? content
                      : (stryCov_9fa48('514', '515'), content?.substring(0, 50)),
                })
          );
          return stryMutAct_9fa48('516')
            ? {}
            : (stryCov_9fa48('516'),
              {
                userId: stryMutAct_9fa48('519')
                  ? data.senderStaffId && ''
                  : stryMutAct_9fa48('518')
                    ? false
                    : stryMutAct_9fa48('517')
                      ? true
                      : (stryCov_9fa48('517', '518', '519'),
                        data.senderStaffId ||
                          (stryMutAct_9fa48('520')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('520'), ''))),
                content: content,
                sessionWebhook: stryMutAct_9fa48('523')
                  ? data.sessionWebhook && ''
                  : stryMutAct_9fa48('522')
                    ? false
                    : stryMutAct_9fa48('521')
                      ? true
                      : (stryCov_9fa48('521', '522', '523'),
                        data.sessionWebhook ||
                          (stryMutAct_9fa48('524')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('524'), ''))),
                messageId: message.headers.messageId,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('525')) {
          {
          }
        } else {
          stryCov_9fa48('525');
          error(
            stryMutAct_9fa48('526') ? '' : (stryCov_9fa48('526'), 'Failed to parse stream message'),
            stryMutAct_9fa48('527')
              ? {}
              : (stryCov_9fa48('527'),
                {
                  error: e instanceof Error ? e.message : String(e),
                  rawData: stryMutAct_9fa48('529')
                    ? message.data.substring(0, 500)
                    : stryMutAct_9fa48('528')
                      ? message.data
                      : (stryCov_9fa48('528', '529'), message.data?.substring(0, 500)),
                })
          );
          return null;
        }
      }
    }
  }
  async sendReply(sessionWebhook: string, content: string): Promise<boolean> {
    if (stryMutAct_9fa48('530')) {
      {
      }
    } else {
      stryCov_9fa48('530');
      if (
        stryMutAct_9fa48('533')
          ? false
          : stryMutAct_9fa48('532')
            ? true
            : stryMutAct_9fa48('531')
              ? sessionWebhook
              : (stryCov_9fa48('531', '532', '533'), !sessionWebhook)
      ) {
        if (stryMutAct_9fa48('534')) {
          {
          }
        } else {
          stryCov_9fa48('534');
          error(
            stryMutAct_9fa48('535') ? '' : (stryCov_9fa48('535'), 'No sessionWebhook provided')
          );
          return stryMutAct_9fa48('536') ? true : (stryCov_9fa48('536'), false);
        }
      }
      info(
        stryMutAct_9fa48('537') ? '' : (stryCov_9fa48('537'), 'Sending reply'),
        stryMutAct_9fa48('538')
          ? {}
          : (stryCov_9fa48('538'),
            {
              webhook: sessionWebhook,
              contentLength: content.length,
              contentPreview: stryMutAct_9fa48('539')
                ? content
                : (stryCov_9fa48('539'), content.substring(0, 50)),
            })
      );
      try {
        if (stryMutAct_9fa48('540')) {
          {
          }
        } else {
          stryCov_9fa48('540');
          const body = stryMutAct_9fa48('541')
            ? {}
            : (stryCov_9fa48('541'),
              {
                msgtype: stryMutAct_9fa48('542') ? '' : (stryCov_9fa48('542'), 'text'),
                text: stryMutAct_9fa48('543')
                  ? {}
                  : (stryCov_9fa48('543'),
                    {
                      content,
                    }),
              });
          const response = await fetch(
            sessionWebhook,
            stryMutAct_9fa48('544')
              ? {}
              : (stryCov_9fa48('544'),
                {
                  method: stryMutAct_9fa48('545') ? '' : (stryCov_9fa48('545'), 'POST'),
                  headers: stryMutAct_9fa48('546')
                    ? {}
                    : (stryCov_9fa48('546'),
                      {
                        'Content-Type': stryMutAct_9fa48('547')
                          ? ''
                          : (stryCov_9fa48('547'), 'application/json'),
                      }),
                  body: JSON.stringify(body),
                })
          );
          info(
            stryMutAct_9fa48('548') ? '' : (stryCov_9fa48('548'), 'Reply response'),
            stryMutAct_9fa48('549')
              ? {}
              : (stryCov_9fa48('549'),
                {
                  status: response.status,
                  statusText: response.statusText,
                  ok: response.ok,
                })
          );
          if (
            stryMutAct_9fa48('552')
              ? false
              : stryMutAct_9fa48('551')
                ? true
                : stryMutAct_9fa48('550')
                  ? response.ok
                  : (stryCov_9fa48('550', '551', '552'), !response.ok)
          ) {
            if (stryMutAct_9fa48('553')) {
              {
              }
            } else {
              stryCov_9fa48('553');
              const responseText = await response.text();
              error(
                stryMutAct_9fa48('554') ? '' : (stryCov_9fa48('554'), 'Failed to send reply'),
                stryMutAct_9fa48('555')
                  ? {}
                  : (stryCov_9fa48('555'),
                    {
                      status: response.status,
                      statusText: response.statusText,
                      webhook: sessionWebhook,
                      responseText: stryMutAct_9fa48('556')
                        ? responseText
                        : (stryCov_9fa48('556'), responseText.substring(0, 200)),
                    })
              );
              return stryMutAct_9fa48('557') ? true : (stryCov_9fa48('557'), false);
            }
          }
          info(
            stryMutAct_9fa48('558') ? '' : (stryCov_9fa48('558'), 'Reply sent successfully'),
            stryMutAct_9fa48('559')
              ? {}
              : (stryCov_9fa48('559'),
                {
                  webhook: sessionWebhook,
                  contentLength: content.length,
                })
          );
          return stryMutAct_9fa48('560') ? false : (stryCov_9fa48('560'), true);
        }
      } catch (e) {
        if (stryMutAct_9fa48('561')) {
          {
          }
        } else {
          stryCov_9fa48('561');
          const errMsg = e instanceof Error ? e.message : String(e);
          error(
            stryMutAct_9fa48('562') ? '' : (stryCov_9fa48('562'), 'Failed to send reply'),
            stryMutAct_9fa48('563')
              ? {}
              : (stryCov_9fa48('563'),
                {
                  error: errMsg,
                })
          );
          return stryMutAct_9fa48('564') ? true : (stryCov_9fa48('564'), false);
        }
      }
    }
  }
  async processStreamMessage(message: StreamMessage, retryCount = 0): Promise<ProcessResult> {
    if (stryMutAct_9fa48('565')) {
      {
      }
    } else {
      stryCov_9fa48('565');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('568')
          ? false
          : stryMutAct_9fa48('567')
            ? true
            : stryMutAct_9fa48('566')
              ? parsed
              : (stryCov_9fa48('566', '567', '568'), !parsed)
      ) {
        if (stryMutAct_9fa48('569')) {
          {
          }
        } else {
          stryCov_9fa48('569');
          error(
            stryMutAct_9fa48('570')
              ? ''
              : (stryCov_9fa48('570'), 'Message parse failed - invalid format'),
            stryMutAct_9fa48('571')
              ? {}
              : (stryCov_9fa48('571'),
                {
                  data: stryMutAct_9fa48('573')
                    ? message.data.substring(0, 200)
                    : stryMutAct_9fa48('572')
                      ? message.data
                      : (stryCov_9fa48('572', '573'), message.data?.substring(0, 200)),
                })
          );
          return stryMutAct_9fa48('574')
            ? {}
            : (stryCov_9fa48('574'),
              {
                success: stryMutAct_9fa48('575') ? true : (stryCov_9fa48('575'), false),
                error: stryMutAct_9fa48('576')
                  ? ''
                  : (stryCov_9fa48('576'), 'Invalid message format'),
              });
        }
      }
      if (
        stryMutAct_9fa48('579')
          ? !parsed.userId && !parsed.content
          : stryMutAct_9fa48('578')
            ? false
            : stryMutAct_9fa48('577')
              ? true
              : (stryCov_9fa48('577', '578', '579'),
                (stryMutAct_9fa48('580')
                  ? parsed.userId
                  : (stryCov_9fa48('580'), !parsed.userId)) ||
                  (stryMutAct_9fa48('581')
                    ? parsed.content
                    : (stryCov_9fa48('581'), !parsed.content)))
      ) {
        if (stryMutAct_9fa48('582')) {
          {
          }
        } else {
          stryCov_9fa48('582');
          error(
            stryMutAct_9fa48('583')
              ? ''
              : (stryCov_9fa48('583'), 'Message missing required fields'),
            stryMutAct_9fa48('584')
              ? {}
              : (stryCov_9fa48('584'),
                {
                  userId: parsed.userId,
                  content: stryMutAct_9fa48('586')
                    ? parsed.content.substring(0, 100)
                    : stryMutAct_9fa48('585')
                      ? parsed.content
                      : (stryCov_9fa48('585', '586'), parsed.content?.substring(0, 100)),
                })
          );
          return stryMutAct_9fa48('587')
            ? {}
            : (stryCov_9fa48('587'),
              {
                success: stryMutAct_9fa48('588') ? true : (stryCov_9fa48('588'), false),
                error: stryMutAct_9fa48('589')
                  ? ''
                  : (stryCov_9fa48('589'), 'Missing userId or content'),
              });
        }
      }
      info(
        stryMutAct_9fa48('590') ? '' : (stryCov_9fa48('590'), 'Processing stream message'),
        stryMutAct_9fa48('591')
          ? {}
          : (stryCov_9fa48('591'),
            {
              userId: parsed.userId,
              content: parsed.content,
              messageId: parsed.messageId,
            })
      );
      let state = await this.repo.findActiveInterview(parsed.userId);
      if (
        stryMutAct_9fa48('594')
          ? false
          : stryMutAct_9fa48('593')
            ? true
            : stryMutAct_9fa48('592')
              ? state
              : (stryCov_9fa48('592', '593', '594'), !state)
      ) {
        if (stryMutAct_9fa48('595')) {
          {
          }
        } else {
          stryCov_9fa48('595');
          const templateId = await this.resolveDefaultTemplateId();
          const interviewId = await this.repo.createInterview(parsed.userId, templateId);
          state = stryMutAct_9fa48('596')
            ? {}
            : (stryCov_9fa48('596'),
              {
                userId: parsed.userId,
                interviewId,
                templateId,
                status: stryMutAct_9fa48('597') ? '' : (stryCov_9fa48('597'), 'PENDING'),
                messages: stryMutAct_9fa48('598')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('598'), []),
                currentQuestion: 0,
                followupCount: 0,
                maxFollowups: 2,
                responses: stryMutAct_9fa48('599')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('599'), []),
                reportGenerated: stryMutAct_9fa48('600') ? true : (stryCov_9fa48('600'), false),
                version: 1,
                originalVersion: 1,
                pendingMessages: stryMutAct_9fa48('601')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('601'), []),
                pendingResponses: stryMutAct_9fa48('602')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('602'), []),
              });
        }
      }
      state.pendingMessages.push(
        stryMutAct_9fa48('603')
          ? {}
          : (stryCov_9fa48('603'),
            {
              role: stryMutAct_9fa48('604') ? '' : (stryCov_9fa48('604'), 'user'),
              content: parsed.content,
              isVoice: stryMutAct_9fa48('605') ? true : (stryCov_9fa48('605'), false),
            })
      );

      // Resolve userName for personalization if not already in state
      if (
        stryMutAct_9fa48('608')
          ? false
          : stryMutAct_9fa48('607')
            ? true
            : stryMutAct_9fa48('606')
              ? state.userName
              : (stryCov_9fa48('606', '607', '608'), !state.userName)
      ) {
        if (stryMutAct_9fa48('609')) {
          {
          }
        } else {
          stryCov_9fa48('609');
          const prisma = new PrismaClient();
          try {
            if (stryMutAct_9fa48('610')) {
              {
              }
            } else {
              stryCov_9fa48('610');
              // Check for any interview belonging to this user to find the planId
              const interview = await prisma.interview.findFirst(
                stryMutAct_9fa48('611')
                  ? {}
                  : (stryCov_9fa48('611'),
                    {
                      where: stryMutAct_9fa48('612')
                        ? {}
                        : (stryCov_9fa48('612'),
                          {
                            userId: parsed.userId,
                          }),
                      select: stryMutAct_9fa48('613')
                        ? {}
                        : (stryCov_9fa48('613'),
                          {
                            planId: stryMutAct_9fa48('614') ? false : (stryCov_9fa48('614'), true),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('617')
                  ? interview.planId
                  : stryMutAct_9fa48('616')
                    ? false
                    : stryMutAct_9fa48('615')
                      ? true
                      : (stryCov_9fa48('615', '616', '617'), interview?.planId)
              ) {
                if (stryMutAct_9fa48('618')) {
                  {
                  }
                } else {
                  stryCov_9fa48('618');
                  const plan = await prisma.interviewPlan.findUnique(
                    stryMutAct_9fa48('619')
                      ? {}
                      : (stryCov_9fa48('619'),
                        {
                          where: stryMutAct_9fa48('620')
                            ? {}
                            : (stryCov_9fa48('620'),
                              {
                                id: interview.planId,
                              }),
                          select: stryMutAct_9fa48('621')
                            ? {}
                            : (stryCov_9fa48('621'),
                              {
                                inviteeData: stryMutAct_9fa48('622')
                                  ? false
                                  : (stryCov_9fa48('622'), true),
                              }),
                        })
                  );
                  if (
                    stryMutAct_9fa48('625')
                      ? plan.inviteeData
                      : stryMutAct_9fa48('624')
                        ? false
                        : stryMutAct_9fa48('623')
                          ? true
                          : (stryCov_9fa48('623', '624', '625'), plan?.inviteeData)
                  ) {
                    if (stryMutAct_9fa48('626')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('626');
                      const invitees = plan.inviteeData as {
                        userId: string;
                        name?: string;
                      }[];
                      const matched = invitees.find(
                        stryMutAct_9fa48('627')
                          ? () => undefined
                          : (stryCov_9fa48('627'),
                            (inv) =>
                              stryMutAct_9fa48('630')
                                ? inv.userId !== parsed.userId
                                : stryMutAct_9fa48('629')
                                  ? false
                                  : stryMutAct_9fa48('628')
                                    ? true
                                    : (stryCov_9fa48('628', '629', '630'),
                                      inv.userId === parsed.userId))
                      );
                      if (
                        stryMutAct_9fa48('633')
                          ? matched.name
                          : stryMutAct_9fa48('632')
                            ? false
                            : stryMutAct_9fa48('631')
                              ? true
                              : (stryCov_9fa48('631', '632', '633'), matched?.name)
                      )
                        state.userName = matched.name;
                    }
                  }
                }
              }
            }
          } catch {
            // Silently fail userName resolution
          } finally {
            if (stryMutAct_9fa48('634')) {
              {
              }
            } else {
              stryCov_9fa48('634');
              await prisma.$disconnect();
            }
          }
        }
      }
      const graphResult: GraphResult = await runInterviewGraph(
        state,
        stryMutAct_9fa48('635')
          ? {}
          : (stryCov_9fa48('635'),
            {
              userId: parsed.userId,
              content: parsed.content,
              isVoice: stryMutAct_9fa48('636') ? true : (stryCov_9fa48('636'), false),
            })
      );
      const nextState = graphResult.nextState;
      // Persist only newly added responses to the Response table (diff against what was loaded from DB)
      const existingCount = state.responses.length;
      const newResponses = stryMutAct_9fa48('637')
        ? nextState.responses
        : (stryCov_9fa48('637'), nextState.responses.slice(existingCount));
      if (
        stryMutAct_9fa48('641')
          ? newResponses.length <= 0
          : stryMutAct_9fa48('640')
            ? newResponses.length >= 0
            : stryMutAct_9fa48('639')
              ? false
              : stryMutAct_9fa48('638')
                ? true
                : (stryCov_9fa48('638', '639', '640', '641'), newResponses.length > 0)
      ) {
        if (stryMutAct_9fa48('642')) {
          {
          }
        } else {
          stryCov_9fa48('642');
          nextState.pendingResponses = newResponses;
        }
      }
      nextState.pendingMessages.push(
        stryMutAct_9fa48('643')
          ? {}
          : (stryCov_9fa48('643'),
            {
              role: stryMutAct_9fa48('644') ? '' : (stryCov_9fa48('644'), 'assistant'),
              content: graphResult.response,
              isVoice: stryMutAct_9fa48('645') ? true : (stryCov_9fa48('645'), false),
            })
      );
      try {
        if (stryMutAct_9fa48('646')) {
          {
          }
        } else {
          stryCov_9fa48('646');
          await this.repo.saveFullState(state.interviewId as string, nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('647')) {
          {
          }
        } else {
          stryCov_9fa48('647');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('648')
                ? ''
                : (stryCov_9fa48('648'), 'Unknown error');
          if (
            stryMutAct_9fa48('651')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('650')
                ? false
                : stryMutAct_9fa48('649')
                  ? true
                  : (stryCov_9fa48('649', '650', '651'),
                    errorMsg.includes(
                      stryMutAct_9fa48('652') ? '' : (stryCov_9fa48('652'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('655')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('654')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('653')
                            ? true
                            : (stryCov_9fa48('653', '654', '655'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('656')) {
              {
              }
            } else {
              stryCov_9fa48('656');
              info(
                stryMutAct_9fa48('657')
                  ? ''
                  : (stryCov_9fa48('657'), 'Retrying due to version conflict'),
                stryMutAct_9fa48('658')
                  ? {}
                  : (stryCov_9fa48('658'),
                    {
                      userId: parsed.userId,
                      retryCount: stryMutAct_9fa48('659')
                        ? retryCount - 1
                        : (stryCov_9fa48('659'), retryCount + 1),
                    })
              );
              const freshState = await this.repo.loadFullState(
                state.interviewId as string,
                parsed.userId
              );
              if (
                stryMutAct_9fa48('661')
                  ? false
                  : stryMutAct_9fa48('660')
                    ? true
                    : (stryCov_9fa48('660', '661'), freshState)
              ) {
                if (stryMutAct_9fa48('662')) {
                  {
                  }
                } else {
                  stryCov_9fa48('662');
                  freshState.pendingMessages = stryMutAct_9fa48('663')
                    ? []
                    : (stryCov_9fa48('663'),
                      [
                        stryMutAct_9fa48('664')
                          ? {}
                          : (stryCov_9fa48('664'),
                            {
                              role: stryMutAct_9fa48('665') ? '' : (stryCov_9fa48('665'), 'user'),
                              content: parsed.content,
                              isVoice: stryMutAct_9fa48('666')
                                ? true
                                : (stryCov_9fa48('666'), false),
                            }),
                      ]);
                  const retryGraphResult = await runInterviewGraph(
                    freshState,
                    stryMutAct_9fa48('667')
                      ? {}
                      : (stryCov_9fa48('667'),
                        {
                          userId: parsed.userId,
                          content: parsed.content,
                          isVoice: stryMutAct_9fa48('668') ? true : (stryCov_9fa48('668'), false),
                        })
                  );
                  const retryExistingCount = freshState.responses.length;
                  const retryNewResponses = stryMutAct_9fa48('669')
                    ? retryGraphResult.nextState.responses
                    : (stryCov_9fa48('669'),
                      retryGraphResult.nextState.responses.slice(retryExistingCount));
                  if (
                    stryMutAct_9fa48('673')
                      ? retryNewResponses.length <= 0
                      : stryMutAct_9fa48('672')
                        ? retryNewResponses.length >= 0
                        : stryMutAct_9fa48('671')
                          ? false
                          : stryMutAct_9fa48('670')
                            ? true
                            : (stryCov_9fa48('670', '671', '672', '673'),
                              retryNewResponses.length > 0)
                  ) {
                    if (stryMutAct_9fa48('674')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('674');
                      retryGraphResult.nextState.pendingResponses = retryNewResponses;
                    }
                  }
                  retryGraphResult.nextState.pendingMessages.push(
                    stryMutAct_9fa48('675')
                      ? {}
                      : (stryCov_9fa48('675'),
                        {
                          role: stryMutAct_9fa48('676') ? '' : (stryCov_9fa48('676'), 'assistant'),
                          content: retryGraphResult.response,
                          isVoice: stryMutAct_9fa48('677') ? true : (stryCov_9fa48('677'), false),
                        })
                  );
                  return this.processStreamMessageWithState(
                    message,
                    retryGraphResult,
                    freshState,
                    stryMutAct_9fa48('678')
                      ? retryCount - 1
                      : (stryCov_9fa48('678'), retryCount + 1)
                  );
                }
              }
            }
          }
          return stryMutAct_9fa48('679')
            ? {}
            : (stryCov_9fa48('679'),
              {
                success: stryMutAct_9fa48('680') ? true : (stryCov_9fa48('680'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('682')
          ? false
          : stryMutAct_9fa48('681')
            ? true
            : (stryCov_9fa48('681', '682'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('683')) {
          {
          }
        } else {
          stryCov_9fa48('683');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('684')
        ? {}
        : (stryCov_9fa48('684'),
          {
            success: stryMutAct_9fa48('685') ? false : (stryCov_9fa48('685'), true),
            response: graphResult.response,
          });
    }
  }
  private async processStreamMessageWithState(
    message: StreamMessage,
    graphResult: GraphResult,
    state: InterviewState,
    retryCount: number
  ): Promise<ProcessResult> {
    if (stryMutAct_9fa48('686')) {
      {
      }
    } else {
      stryCov_9fa48('686');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('689')
          ? false
          : stryMutAct_9fa48('688')
            ? true
            : stryMutAct_9fa48('687')
              ? parsed
              : (stryCov_9fa48('687', '688', '689'), !parsed)
      ) {
        if (stryMutAct_9fa48('690')) {
          {
          }
        } else {
          stryCov_9fa48('690');
          return stryMutAct_9fa48('691')
            ? {}
            : (stryCov_9fa48('691'),
              {
                success: stryMutAct_9fa48('692') ? true : (stryCov_9fa48('692'), false),
                error: stryMutAct_9fa48('693')
                  ? ''
                  : (stryCov_9fa48('693'), 'Invalid message format'),
              });
        }
      }
      try {
        if (stryMutAct_9fa48('694')) {
          {
          }
        } else {
          stryCov_9fa48('694');
          const existingCount = state.responses.length;
          const newResponses = stryMutAct_9fa48('695')
            ? graphResult.nextState.responses
            : (stryCov_9fa48('695'), graphResult.nextState.responses.slice(existingCount));
          if (
            stryMutAct_9fa48('699')
              ? newResponses.length <= 0
              : stryMutAct_9fa48('698')
                ? newResponses.length >= 0
                : stryMutAct_9fa48('697')
                  ? false
                  : stryMutAct_9fa48('696')
                    ? true
                    : (stryCov_9fa48('696', '697', '698', '699'), newResponses.length > 0)
          ) {
            if (stryMutAct_9fa48('700')) {
              {
              }
            } else {
              stryCov_9fa48('700');
              graphResult.nextState.pendingResponses = newResponses;
            }
          }
          await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('701')) {
          {
          }
        } else {
          stryCov_9fa48('701');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('702')
                ? ''
                : (stryCov_9fa48('702'), 'Unknown error');
          if (
            stryMutAct_9fa48('705')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('704')
                ? false
                : stryMutAct_9fa48('703')
                  ? true
                  : (stryCov_9fa48('703', '704', '705'),
                    errorMsg.includes(
                      stryMutAct_9fa48('706') ? '' : (stryCov_9fa48('706'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('709')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('708')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('707')
                            ? true
                            : (stryCov_9fa48('707', '708', '709'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('710')) {
              {
              }
            } else {
              stryCov_9fa48('710');
              return this.processStreamMessage(
                message,
                stryMutAct_9fa48('711') ? retryCount - 1 : (stryCov_9fa48('711'), retryCount + 1)
              );
            }
          }
          return stryMutAct_9fa48('712')
            ? {}
            : (stryCov_9fa48('712'),
              {
                success: stryMutAct_9fa48('713') ? true : (stryCov_9fa48('713'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('715')
          ? false
          : stryMutAct_9fa48('714')
            ? true
            : (stryCov_9fa48('714', '715'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('716')) {
          {
          }
        } else {
          stryCov_9fa48('716');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('717')
        ? {}
        : (stryCov_9fa48('717'),
          {
            success: stryMutAct_9fa48('718') ? false : (stryCov_9fa48('718'), true),
            response: graphResult.response,
          });
    }
  }
  private async resolveDefaultTemplateId(): Promise<string> {
    if (stryMutAct_9fa48('719')) {
      {
      }
    } else {
      stryCov_9fa48('719');
      const repo = new TemplateRepository();
      const templates = await repo.findAll();
      const published = templates.find(
        stryMutAct_9fa48('720')
          ? () => undefined
          : (stryCov_9fa48('720'),
            (t) =>
              stryMutAct_9fa48('723')
                ? t.status !== 'PUBLISHED'
                : stryMutAct_9fa48('722')
                  ? false
                  : stryMutAct_9fa48('721')
                    ? true
                    : (stryCov_9fa48('721', '722', '723'),
                      t.status ===
                        (stryMutAct_9fa48('724') ? '' : (stryCov_9fa48('724'), 'PUBLISHED'))))
      );
      if (
        stryMutAct_9fa48('726')
          ? false
          : stryMutAct_9fa48('725')
            ? true
            : (stryCov_9fa48('725', '726'), published)
      )
        return published.id;
      return (
        stryMutAct_9fa48('730')
          ? templates.length <= 0
          : stryMutAct_9fa48('729')
            ? templates.length >= 0
            : stryMutAct_9fa48('728')
              ? false
              : stryMutAct_9fa48('727')
                ? true
                : (stryCov_9fa48('727', '728', '729', '730'), templates.length > 0)
      )
        ? templates[0].id
        : stryMutAct_9fa48('731')
          ? ''
          : (stryCov_9fa48('731'), 'test-template');
    }
  }
}
export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  if (stryMutAct_9fa48('732')) {
    {
    }
  } else {
    stryCov_9fa48('732');
    try {
      if (stryMutAct_9fa48('733')) {
        {
        }
      } else {
        stryCov_9fa48('733');
        const data = JSON.parse(message.data);
        const content = stryMutAct_9fa48('736')
          ? (data.text?.content || data.content) && ''
          : stryMutAct_9fa48('735')
            ? false
            : stryMutAct_9fa48('734')
              ? true
              : (stryCov_9fa48('734', '735', '736'),
                (stryMutAct_9fa48('738')
                  ? data.text?.content && data.content
                  : stryMutAct_9fa48('737')
                    ? false
                    : (stryCov_9fa48('737', '738'),
                      (stryMutAct_9fa48('739')
                        ? data.text.content
                        : (stryCov_9fa48('739'), data.text?.content)) || data.content)) ||
                  (stryMutAct_9fa48('740') ? 'Stryker was here!' : (stryCov_9fa48('740'), '')));
        return stryMutAct_9fa48('741')
          ? {}
          : (stryCov_9fa48('741'),
            {
              userId: stryMutAct_9fa48('744')
                ? data.senderStaffId && ''
                : stryMutAct_9fa48('743')
                  ? false
                  : stryMutAct_9fa48('742')
                    ? true
                    : (stryCov_9fa48('742', '743', '744'),
                      data.senderStaffId ||
                        (stryMutAct_9fa48('745')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('745'), ''))),
              content: content,
              sessionWebhook: stryMutAct_9fa48('748')
                ? data.sessionWebhook && ''
                : stryMutAct_9fa48('747')
                  ? false
                  : stryMutAct_9fa48('746')
                    ? true
                    : (stryCov_9fa48('746', '747', '748'),
                      data.sessionWebhook ||
                        (stryMutAct_9fa48('749')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('749'), ''))),
              messageId: message.headers.messageId,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('750')) {
        {
        }
      } else {
        stryCov_9fa48('750');
        error(
          stryMutAct_9fa48('751') ? '' : (stryCov_9fa48('751'), 'Failed to parse stream message'),
          stryMutAct_9fa48('752')
            ? {}
            : (stryCov_9fa48('752'),
              {
                error: e instanceof Error ? e.message : String(e),
              })
        );
        return null;
      }
    }
  }
}
export async function sendReply(sessionWebhook: string, content: string): Promise<boolean> {
  if (stryMutAct_9fa48('753')) {
    {
    }
  } else {
    stryCov_9fa48('753');
    if (
      stryMutAct_9fa48('756')
        ? false
        : stryMutAct_9fa48('755')
          ? true
          : stryMutAct_9fa48('754')
            ? sessionWebhook
            : (stryCov_9fa48('754', '755', '756'), !sessionWebhook)
    ) {
      if (stryMutAct_9fa48('757')) {
        {
        }
      } else {
        stryCov_9fa48('757');
        error(stryMutAct_9fa48('758') ? '' : (stryCov_9fa48('758'), 'No sessionWebhook provided'));
        return stryMutAct_9fa48('759') ? true : (stryCov_9fa48('759'), false);
      }
    }
    info(
      stryMutAct_9fa48('760') ? '' : (stryCov_9fa48('760'), 'Sending reply (exported)'),
      stryMutAct_9fa48('761')
        ? {}
        : (stryCov_9fa48('761'),
          {
            webhook: sessionWebhook,
            contentLength: content.length,
          })
    );
    try {
      if (stryMutAct_9fa48('762')) {
        {
        }
      } else {
        stryCov_9fa48('762');
        const body = stryMutAct_9fa48('763')
          ? {}
          : (stryCov_9fa48('763'),
            {
              msgtype: stryMutAct_9fa48('764') ? '' : (stryCov_9fa48('764'), 'text'),
              text: stryMutAct_9fa48('765')
                ? {}
                : (stryCov_9fa48('765'),
                  {
                    content,
                  }),
            });
        const response = await fetch(
          sessionWebhook,
          stryMutAct_9fa48('766')
            ? {}
            : (stryCov_9fa48('766'),
              {
                method: stryMutAct_9fa48('767') ? '' : (stryCov_9fa48('767'), 'POST'),
                headers: stryMutAct_9fa48('768')
                  ? {}
                  : (stryCov_9fa48('768'),
                    {
                      'Content-Type': stryMutAct_9fa48('769')
                        ? ''
                        : (stryCov_9fa48('769'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('772')
            ? false
            : stryMutAct_9fa48('771')
              ? true
              : stryMutAct_9fa48('770')
                ? response.ok
                : (stryCov_9fa48('770', '771', '772'), !response.ok)
        ) {
          if (stryMutAct_9fa48('773')) {
            {
            }
          } else {
            stryCov_9fa48('773');
            const responseText = await response.text();
            error(
              stryMutAct_9fa48('774') ? '' : (stryCov_9fa48('774'), 'Failed to send reply'),
              stryMutAct_9fa48('775')
                ? {}
                : (stryCov_9fa48('775'),
                  {
                    status: response.status,
                    statusText: response.statusText,
                    webhook: sessionWebhook,
                    responseText: stryMutAct_9fa48('776')
                      ? responseText
                      : (stryCov_9fa48('776'), responseText.substring(0, 200)),
                  })
            );
            return stryMutAct_9fa48('777') ? true : (stryCov_9fa48('777'), false);
          }
        }
        info(
          stryMutAct_9fa48('778') ? '' : (stryCov_9fa48('778'), 'Reply sent'),
          stryMutAct_9fa48('779')
            ? {}
            : (stryCov_9fa48('779'),
              {
                webhook: sessionWebhook,
                contentLength: content.length,
              })
        );
        return stryMutAct_9fa48('780') ? false : (stryCov_9fa48('780'), true);
      }
    } catch (e) {
      if (stryMutAct_9fa48('781')) {
        {
        }
      } else {
        stryCov_9fa48('781');
        const errMsg = e instanceof Error ? e.message : String(e);
        error(
          stryMutAct_9fa48('782') ? '' : (stryCov_9fa48('782'), 'Failed to send reply'),
          stryMutAct_9fa48('783')
            ? {}
            : (stryCov_9fa48('783'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('784') ? true : (stryCov_9fa48('784'), false);
      }
    }
  }
}
export async function processStreamMessage(message: StreamMessage): Promise<ProcessResult> {
  if (stryMutAct_9fa48('785')) {
    {
    }
  } else {
    stryCov_9fa48('785');
    const service = new StreamMessageService();
    return service.processStreamMessage(message);
  }
}
