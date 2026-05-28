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
    if (stryMutAct_9fa48('197')) {
      {
      }
    } else {
      stryCov_9fa48('197');
      this.repo = stryMutAct_9fa48('200')
        ? repo && new InterviewStateRepository()
        : stryMutAct_9fa48('199')
          ? false
          : stryMutAct_9fa48('198')
            ? true
            : (stryCov_9fa48('198', '199', '200'), repo || new InterviewStateRepository());
    }
  }
  parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
    if (stryMutAct_9fa48('201')) {
      {
      }
    } else {
      stryCov_9fa48('201');
      try {
        if (stryMutAct_9fa48('202')) {
          {
          }
        } else {
          stryCov_9fa48('202');
          info(
            stryMutAct_9fa48('203') ? '' : (stryCov_9fa48('203'), 'Parsing stream message'),
            stryMutAct_9fa48('204')
              ? {}
              : (stryCov_9fa48('204'),
                {
                  dataLength: stryMutAct_9fa48('205')
                    ? message.data.length
                    : (stryCov_9fa48('205'), message.data?.length),
                  hasData: stryMutAct_9fa48('206')
                    ? !message.data
                    : (stryCov_9fa48('206'),
                      !(stryMutAct_9fa48('207')
                        ? message.data
                        : (stryCov_9fa48('207'), !message.data))),
                })
          );
          const data = JSON.parse(message.data);
          info(
            stryMutAct_9fa48('208') ? '' : (stryCov_9fa48('208'), 'Parsed outer data'),
            stryMutAct_9fa48('209')
              ? {}
              : (stryCov_9fa48('209'),
                {
                  hasSenderStaffId: stryMutAct_9fa48('210')
                    ? !data.senderStaffId
                    : (stryCov_9fa48('210'),
                      !(stryMutAct_9fa48('211')
                        ? data.senderStaffId
                        : (stryCov_9fa48('211'), !data.senderStaffId))),
                  hasText: stryMutAct_9fa48('212')
                    ? !data.text
                    : (stryCov_9fa48('212'),
                      !(stryMutAct_9fa48('213') ? data.text : (stryCov_9fa48('213'), !data.text))),
                  hasContent: stryMutAct_9fa48('214')
                    ? !data.content
                    : (stryCov_9fa48('214'),
                      !(stryMutAct_9fa48('215')
                        ? data.content
                        : (stryCov_9fa48('215'), !data.content))),
                  hasSessionWebhook: stryMutAct_9fa48('216')
                    ? !data.sessionWebhook
                    : (stryCov_9fa48('216'),
                      !(stryMutAct_9fa48('217')
                        ? data.sessionWebhook
                        : (stryCov_9fa48('217'), !data.sessionWebhook))),
                  msgtype: data.msgtype,
                })
          );
          const content = stryMutAct_9fa48('220')
            ? (data.text?.content || data.content) && ''
            : stryMutAct_9fa48('219')
              ? false
              : stryMutAct_9fa48('218')
                ? true
                : (stryCov_9fa48('218', '219', '220'),
                  (stryMutAct_9fa48('222')
                    ? data.text?.content && data.content
                    : stryMutAct_9fa48('221')
                      ? false
                      : (stryCov_9fa48('221', '222'),
                        (stryMutAct_9fa48('223')
                          ? data.text.content
                          : (stryCov_9fa48('223'), data.text?.content)) || data.content)) ||
                    (stryMutAct_9fa48('224') ? 'Stryker was here!' : (stryCov_9fa48('224'), '')));
          info(
            stryMutAct_9fa48('225') ? '' : (stryCov_9fa48('225'), 'Extracted content'),
            stryMutAct_9fa48('226')
              ? {}
              : (stryCov_9fa48('226'),
                {
                  contentLength: stryMutAct_9fa48('227')
                    ? content.length
                    : (stryCov_9fa48('227'), content?.length),
                  contentPreview: stryMutAct_9fa48('229')
                    ? content.substring(0, 50)
                    : stryMutAct_9fa48('228')
                      ? content
                      : (stryCov_9fa48('228', '229'), content?.substring(0, 50)),
                })
          );
          return stryMutAct_9fa48('230')
            ? {}
            : (stryCov_9fa48('230'),
              {
                userId: stryMutAct_9fa48('233')
                  ? data.senderStaffId && ''
                  : stryMutAct_9fa48('232')
                    ? false
                    : stryMutAct_9fa48('231')
                      ? true
                      : (stryCov_9fa48('231', '232', '233'),
                        data.senderStaffId ||
                          (stryMutAct_9fa48('234')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('234'), ''))),
                content: content,
                sessionWebhook: stryMutAct_9fa48('237')
                  ? data.sessionWebhook && ''
                  : stryMutAct_9fa48('236')
                    ? false
                    : stryMutAct_9fa48('235')
                      ? true
                      : (stryCov_9fa48('235', '236', '237'),
                        data.sessionWebhook ||
                          (stryMutAct_9fa48('238')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('238'), ''))),
                messageId: message.headers.messageId,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('239')) {
          {
          }
        } else {
          stryCov_9fa48('239');
          error(
            stryMutAct_9fa48('240') ? '' : (stryCov_9fa48('240'), 'Failed to parse stream message'),
            stryMutAct_9fa48('241')
              ? {}
              : (stryCov_9fa48('241'),
                {
                  error: e instanceof Error ? e.message : String(e),
                  rawData: stryMutAct_9fa48('243')
                    ? message.data.substring(0, 500)
                    : stryMutAct_9fa48('242')
                      ? message.data
                      : (stryCov_9fa48('242', '243'), message.data?.substring(0, 500)),
                })
          );
          return null;
        }
      }
    }
  }
  async sendReply(sessionWebhook: string, content: string): Promise<boolean> {
    if (stryMutAct_9fa48('244')) {
      {
      }
    } else {
      stryCov_9fa48('244');
      if (
        stryMutAct_9fa48('247')
          ? false
          : stryMutAct_9fa48('246')
            ? true
            : stryMutAct_9fa48('245')
              ? sessionWebhook
              : (stryCov_9fa48('245', '246', '247'), !sessionWebhook)
      ) {
        if (stryMutAct_9fa48('248')) {
          {
          }
        } else {
          stryCov_9fa48('248');
          error(
            stryMutAct_9fa48('249') ? '' : (stryCov_9fa48('249'), 'No sessionWebhook provided')
          );
          return stryMutAct_9fa48('250') ? true : (stryCov_9fa48('250'), false);
        }
      }
      info(
        stryMutAct_9fa48('251') ? '' : (stryCov_9fa48('251'), 'Sending reply'),
        stryMutAct_9fa48('252')
          ? {}
          : (stryCov_9fa48('252'),
            {
              webhook: sessionWebhook,
              contentLength: content.length,
              contentPreview: stryMutAct_9fa48('253')
                ? content
                : (stryCov_9fa48('253'), content.substring(0, 50)),
            })
      );
      try {
        if (stryMutAct_9fa48('254')) {
          {
          }
        } else {
          stryCov_9fa48('254');
          const body = stryMutAct_9fa48('255')
            ? {}
            : (stryCov_9fa48('255'),
              {
                msgtype: stryMutAct_9fa48('256') ? '' : (stryCov_9fa48('256'), 'text'),
                text: stryMutAct_9fa48('257')
                  ? {}
                  : (stryCov_9fa48('257'),
                    {
                      content,
                    }),
              });
          const response = await fetch(
            sessionWebhook,
            stryMutAct_9fa48('258')
              ? {}
              : (stryCov_9fa48('258'),
                {
                  method: stryMutAct_9fa48('259') ? '' : (stryCov_9fa48('259'), 'POST'),
                  headers: stryMutAct_9fa48('260')
                    ? {}
                    : (stryCov_9fa48('260'),
                      {
                        'Content-Type': stryMutAct_9fa48('261')
                          ? ''
                          : (stryCov_9fa48('261'), 'application/json'),
                      }),
                  body: JSON.stringify(body),
                })
          );
          info(
            stryMutAct_9fa48('262') ? '' : (stryCov_9fa48('262'), 'Reply response'),
            stryMutAct_9fa48('263')
              ? {}
              : (stryCov_9fa48('263'),
                {
                  status: response.status,
                  statusText: response.statusText,
                  ok: response.ok,
                })
          );
          if (
            stryMutAct_9fa48('266')
              ? false
              : stryMutAct_9fa48('265')
                ? true
                : stryMutAct_9fa48('264')
                  ? response.ok
                  : (stryCov_9fa48('264', '265', '266'), !response.ok)
          ) {
            if (stryMutAct_9fa48('267')) {
              {
              }
            } else {
              stryCov_9fa48('267');
              const responseText = await response.text();
              error(
                stryMutAct_9fa48('268') ? '' : (stryCov_9fa48('268'), 'Failed to send reply'),
                stryMutAct_9fa48('269')
                  ? {}
                  : (stryCov_9fa48('269'),
                    {
                      status: response.status,
                      statusText: response.statusText,
                      webhook: sessionWebhook,
                      responseText: stryMutAct_9fa48('270')
                        ? responseText
                        : (stryCov_9fa48('270'), responseText.substring(0, 200)),
                    })
              );
              return stryMutAct_9fa48('271') ? true : (stryCov_9fa48('271'), false);
            }
          }
          info(
            stryMutAct_9fa48('272') ? '' : (stryCov_9fa48('272'), 'Reply sent successfully'),
            stryMutAct_9fa48('273')
              ? {}
              : (stryCov_9fa48('273'),
                {
                  webhook: sessionWebhook,
                  contentLength: content.length,
                })
          );
          return stryMutAct_9fa48('274') ? false : (stryCov_9fa48('274'), true);
        }
      } catch (e) {
        if (stryMutAct_9fa48('275')) {
          {
          }
        } else {
          stryCov_9fa48('275');
          const errMsg = e instanceof Error ? e.message : String(e);
          error(
            stryMutAct_9fa48('276') ? '' : (stryCov_9fa48('276'), 'Failed to send reply'),
            stryMutAct_9fa48('277')
              ? {}
              : (stryCov_9fa48('277'),
                {
                  error: errMsg,
                })
          );
          return stryMutAct_9fa48('278') ? true : (stryCov_9fa48('278'), false);
        }
      }
    }
  }
  async processStreamMessage(message: StreamMessage, retryCount = 0): Promise<ProcessResult> {
    if (stryMutAct_9fa48('279')) {
      {
      }
    } else {
      stryCov_9fa48('279');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('282')
          ? false
          : stryMutAct_9fa48('281')
            ? true
            : stryMutAct_9fa48('280')
              ? parsed
              : (stryCov_9fa48('280', '281', '282'), !parsed)
      ) {
        if (stryMutAct_9fa48('283')) {
          {
          }
        } else {
          stryCov_9fa48('283');
          error(
            stryMutAct_9fa48('284')
              ? ''
              : (stryCov_9fa48('284'), 'Message parse failed - invalid format'),
            stryMutAct_9fa48('285')
              ? {}
              : (stryCov_9fa48('285'),
                {
                  data: stryMutAct_9fa48('287')
                    ? message.data.substring(0, 200)
                    : stryMutAct_9fa48('286')
                      ? message.data
                      : (stryCov_9fa48('286', '287'), message.data?.substring(0, 200)),
                })
          );
          return stryMutAct_9fa48('288')
            ? {}
            : (stryCov_9fa48('288'),
              {
                success: stryMutAct_9fa48('289') ? true : (stryCov_9fa48('289'), false),
                error: stryMutAct_9fa48('290')
                  ? ''
                  : (stryCov_9fa48('290'), 'Invalid message format'),
              });
        }
      }
      if (
        stryMutAct_9fa48('293')
          ? !parsed.userId && !parsed.content
          : stryMutAct_9fa48('292')
            ? false
            : stryMutAct_9fa48('291')
              ? true
              : (stryCov_9fa48('291', '292', '293'),
                (stryMutAct_9fa48('294')
                  ? parsed.userId
                  : (stryCov_9fa48('294'), !parsed.userId)) ||
                  (stryMutAct_9fa48('295')
                    ? parsed.content
                    : (stryCov_9fa48('295'), !parsed.content)))
      ) {
        if (stryMutAct_9fa48('296')) {
          {
          }
        } else {
          stryCov_9fa48('296');
          error(
            stryMutAct_9fa48('297')
              ? ''
              : (stryCov_9fa48('297'), 'Message missing required fields'),
            stryMutAct_9fa48('298')
              ? {}
              : (stryCov_9fa48('298'),
                {
                  userId: parsed.userId,
                  content: stryMutAct_9fa48('300')
                    ? parsed.content.substring(0, 100)
                    : stryMutAct_9fa48('299')
                      ? parsed.content
                      : (stryCov_9fa48('299', '300'), parsed.content?.substring(0, 100)),
                })
          );
          return stryMutAct_9fa48('301')
            ? {}
            : (stryCov_9fa48('301'),
              {
                success: stryMutAct_9fa48('302') ? true : (stryCov_9fa48('302'), false),
                error: stryMutAct_9fa48('303')
                  ? ''
                  : (stryCov_9fa48('303'), 'Missing userId or content'),
              });
        }
      }
      info(
        stryMutAct_9fa48('304') ? '' : (stryCov_9fa48('304'), 'Processing stream message'),
        stryMutAct_9fa48('305')
          ? {}
          : (stryCov_9fa48('305'),
            {
              userId: parsed.userId,
              content: parsed.content,
              messageId: parsed.messageId,
            })
      );
      let state = await this.repo.findActiveInterview(parsed.userId);
      if (
        stryMutAct_9fa48('308')
          ? false
          : stryMutAct_9fa48('307')
            ? true
            : stryMutAct_9fa48('306')
              ? state
              : (stryCov_9fa48('306', '307', '308'), !state)
      ) {
        if (stryMutAct_9fa48('309')) {
          {
          }
        } else {
          stryCov_9fa48('309');
          const templateId = await this.resolveDefaultTemplateId();
          const interviewId = await this.repo.createInterview(parsed.userId, templateId);
          state = stryMutAct_9fa48('310')
            ? {}
            : (stryCov_9fa48('310'),
              {
                userId: parsed.userId,
                interviewId,
                templateId,
                status: stryMutAct_9fa48('311') ? '' : (stryCov_9fa48('311'), 'PENDING'),
                messages: stryMutAct_9fa48('312')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('312'), []),
                currentQuestion: 0,
                followupCount: 0,
                maxFollowups: 2,
                responses: stryMutAct_9fa48('313')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('313'), []),
                reportGenerated: stryMutAct_9fa48('314') ? true : (stryCov_9fa48('314'), false),
                version: 1,
                originalVersion: 1,
                pendingMessages: stryMutAct_9fa48('315')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('315'), []),
                pendingResponses: stryMutAct_9fa48('316')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('316'), []),
              });
        }
      }
      state.pendingMessages.push(
        stryMutAct_9fa48('317')
          ? {}
          : (stryCov_9fa48('317'),
            {
              role: stryMutAct_9fa48('318') ? '' : (stryCov_9fa48('318'), 'user'),
              content: parsed.content,
              isVoice: stryMutAct_9fa48('319') ? true : (stryCov_9fa48('319'), false),
            })
      );

      // Resolve userName for personalization if not already in state
      if (
        stryMutAct_9fa48('322')
          ? false
          : stryMutAct_9fa48('321')
            ? true
            : stryMutAct_9fa48('320')
              ? state.userName
              : (stryCov_9fa48('320', '321', '322'), !state.userName)
      ) {
        if (stryMutAct_9fa48('323')) {
          {
          }
        } else {
          stryCov_9fa48('323');
          const prisma = new PrismaClient();
          try {
            if (stryMutAct_9fa48('324')) {
              {
              }
            } else {
              stryCov_9fa48('324');
              // Check for any interview belonging to this user to find the planId
              const interview = await prisma.interview.findFirst(
                stryMutAct_9fa48('325')
                  ? {}
                  : (stryCov_9fa48('325'),
                    {
                      where: stryMutAct_9fa48('326')
                        ? {}
                        : (stryCov_9fa48('326'),
                          {
                            userId: parsed.userId,
                          }),
                      select: stryMutAct_9fa48('327')
                        ? {}
                        : (stryCov_9fa48('327'),
                          {
                            planId: stryMutAct_9fa48('328') ? false : (stryCov_9fa48('328'), true),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('331')
                  ? interview.planId
                  : stryMutAct_9fa48('330')
                    ? false
                    : stryMutAct_9fa48('329')
                      ? true
                      : (stryCov_9fa48('329', '330', '331'), interview?.planId)
              ) {
                if (stryMutAct_9fa48('332')) {
                  {
                  }
                } else {
                  stryCov_9fa48('332');
                  const plan = await prisma.interviewPlan.findUnique(
                    stryMutAct_9fa48('333')
                      ? {}
                      : (stryCov_9fa48('333'),
                        {
                          where: stryMutAct_9fa48('334')
                            ? {}
                            : (stryCov_9fa48('334'),
                              {
                                id: interview.planId,
                              }),
                          select: stryMutAct_9fa48('335')
                            ? {}
                            : (stryCov_9fa48('335'),
                              {
                                inviteeData: stryMutAct_9fa48('336')
                                  ? false
                                  : (stryCov_9fa48('336'), true),
                              }),
                        })
                  );
                  if (
                    stryMutAct_9fa48('339')
                      ? plan.inviteeData
                      : stryMutAct_9fa48('338')
                        ? false
                        : stryMutAct_9fa48('337')
                          ? true
                          : (stryCov_9fa48('337', '338', '339'), plan?.inviteeData)
                  ) {
                    if (stryMutAct_9fa48('340')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('340');
                      const invitees = plan.inviteeData as {
                        userId: string;
                        name?: string;
                      }[];
                      const matched = invitees.find(
                        stryMutAct_9fa48('341')
                          ? () => undefined
                          : (stryCov_9fa48('341'),
                            (inv) =>
                              stryMutAct_9fa48('344')
                                ? inv.userId !== parsed.userId
                                : stryMutAct_9fa48('343')
                                  ? false
                                  : stryMutAct_9fa48('342')
                                    ? true
                                    : (stryCov_9fa48('342', '343', '344'),
                                      inv.userId === parsed.userId))
                      );
                      if (
                        stryMutAct_9fa48('347')
                          ? matched.name
                          : stryMutAct_9fa48('346')
                            ? false
                            : stryMutAct_9fa48('345')
                              ? true
                              : (stryCov_9fa48('345', '346', '347'), matched?.name)
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
            if (stryMutAct_9fa48('348')) {
              {
              }
            } else {
              stryCov_9fa48('348');
              await prisma.$disconnect();
            }
          }
        }
      }
      const graphResult: GraphResult = await runInterviewGraph(
        state,
        stryMutAct_9fa48('349')
          ? {}
          : (stryCov_9fa48('349'),
            {
              userId: parsed.userId,
              content: parsed.content,
              isVoice: stryMutAct_9fa48('350') ? true : (stryCov_9fa48('350'), false),
            })
      );
      const nextState = graphResult.nextState;
      // Persist only newly added responses to the Response table (diff against what was loaded from DB)
      const existingCount = state.responses.length;
      const newResponses = stryMutAct_9fa48('351')
        ? nextState.responses
        : (stryCov_9fa48('351'), nextState.responses.slice(existingCount));
      if (
        stryMutAct_9fa48('355')
          ? newResponses.length <= 0
          : stryMutAct_9fa48('354')
            ? newResponses.length >= 0
            : stryMutAct_9fa48('353')
              ? false
              : stryMutAct_9fa48('352')
                ? true
                : (stryCov_9fa48('352', '353', '354', '355'), newResponses.length > 0)
      ) {
        if (stryMutAct_9fa48('356')) {
          {
          }
        } else {
          stryCov_9fa48('356');
          nextState.pendingResponses = newResponses;
        }
      }
      nextState.pendingMessages.push(
        stryMutAct_9fa48('357')
          ? {}
          : (stryCov_9fa48('357'),
            {
              role: stryMutAct_9fa48('358') ? '' : (stryCov_9fa48('358'), 'assistant'),
              content: graphResult.response,
              isVoice: stryMutAct_9fa48('359') ? true : (stryCov_9fa48('359'), false),
            })
      );
      try {
        if (stryMutAct_9fa48('360')) {
          {
          }
        } else {
          stryCov_9fa48('360');
          await this.repo.saveFullState(state.interviewId as string, nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('361')) {
          {
          }
        } else {
          stryCov_9fa48('361');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('362')
                ? ''
                : (stryCov_9fa48('362'), 'Unknown error');
          if (
            stryMutAct_9fa48('365')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('364')
                ? false
                : stryMutAct_9fa48('363')
                  ? true
                  : (stryCov_9fa48('363', '364', '365'),
                    errorMsg.includes(
                      stryMutAct_9fa48('366') ? '' : (stryCov_9fa48('366'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('369')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('368')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('367')
                            ? true
                            : (stryCov_9fa48('367', '368', '369'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('370')) {
              {
              }
            } else {
              stryCov_9fa48('370');
              info(
                stryMutAct_9fa48('371')
                  ? ''
                  : (stryCov_9fa48('371'), 'Retrying due to version conflict'),
                stryMutAct_9fa48('372')
                  ? {}
                  : (stryCov_9fa48('372'),
                    {
                      userId: parsed.userId,
                      retryCount: stryMutAct_9fa48('373')
                        ? retryCount - 1
                        : (stryCov_9fa48('373'), retryCount + 1),
                    })
              );
              const freshState = await this.repo.loadFullState(
                state.interviewId as string,
                parsed.userId
              );
              if (
                stryMutAct_9fa48('375')
                  ? false
                  : stryMutAct_9fa48('374')
                    ? true
                    : (stryCov_9fa48('374', '375'), freshState)
              ) {
                if (stryMutAct_9fa48('376')) {
                  {
                  }
                } else {
                  stryCov_9fa48('376');
                  freshState.pendingMessages = stryMutAct_9fa48('377')
                    ? []
                    : (stryCov_9fa48('377'),
                      [
                        stryMutAct_9fa48('378')
                          ? {}
                          : (stryCov_9fa48('378'),
                            {
                              role: stryMutAct_9fa48('379') ? '' : (stryCov_9fa48('379'), 'user'),
                              content: parsed.content,
                              isVoice: stryMutAct_9fa48('380')
                                ? true
                                : (stryCov_9fa48('380'), false),
                            }),
                      ]);
                  const retryGraphResult = await runInterviewGraph(
                    freshState,
                    stryMutAct_9fa48('381')
                      ? {}
                      : (stryCov_9fa48('381'),
                        {
                          userId: parsed.userId,
                          content: parsed.content,
                          isVoice: stryMutAct_9fa48('382') ? true : (stryCov_9fa48('382'), false),
                        })
                  );
                  const retryExistingCount = freshState.responses.length;
                  const retryNewResponses = stryMutAct_9fa48('383')
                    ? retryGraphResult.nextState.responses
                    : (stryCov_9fa48('383'),
                      retryGraphResult.nextState.responses.slice(retryExistingCount));
                  if (
                    stryMutAct_9fa48('387')
                      ? retryNewResponses.length <= 0
                      : stryMutAct_9fa48('386')
                        ? retryNewResponses.length >= 0
                        : stryMutAct_9fa48('385')
                          ? false
                          : stryMutAct_9fa48('384')
                            ? true
                            : (stryCov_9fa48('384', '385', '386', '387'),
                              retryNewResponses.length > 0)
                  ) {
                    if (stryMutAct_9fa48('388')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('388');
                      retryGraphResult.nextState.pendingResponses = retryNewResponses;
                    }
                  }
                  retryGraphResult.nextState.pendingMessages.push(
                    stryMutAct_9fa48('389')
                      ? {}
                      : (stryCov_9fa48('389'),
                        {
                          role: stryMutAct_9fa48('390') ? '' : (stryCov_9fa48('390'), 'assistant'),
                          content: retryGraphResult.response,
                          isVoice: stryMutAct_9fa48('391') ? true : (stryCov_9fa48('391'), false),
                        })
                  );
                  return this.processStreamMessageWithState(
                    message,
                    retryGraphResult,
                    freshState,
                    stryMutAct_9fa48('392')
                      ? retryCount - 1
                      : (stryCov_9fa48('392'), retryCount + 1)
                  );
                }
              }
            }
          }
          return stryMutAct_9fa48('393')
            ? {}
            : (stryCov_9fa48('393'),
              {
                success: stryMutAct_9fa48('394') ? true : (stryCov_9fa48('394'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('396')
          ? false
          : stryMutAct_9fa48('395')
            ? true
            : (stryCov_9fa48('395', '396'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('397')) {
          {
          }
        } else {
          stryCov_9fa48('397');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('398')
        ? {}
        : (stryCov_9fa48('398'),
          {
            success: stryMutAct_9fa48('399') ? false : (stryCov_9fa48('399'), true),
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
    if (stryMutAct_9fa48('400')) {
      {
      }
    } else {
      stryCov_9fa48('400');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('403')
          ? false
          : stryMutAct_9fa48('402')
            ? true
            : stryMutAct_9fa48('401')
              ? parsed
              : (stryCov_9fa48('401', '402', '403'), !parsed)
      ) {
        if (stryMutAct_9fa48('404')) {
          {
          }
        } else {
          stryCov_9fa48('404');
          return stryMutAct_9fa48('405')
            ? {}
            : (stryCov_9fa48('405'),
              {
                success: stryMutAct_9fa48('406') ? true : (stryCov_9fa48('406'), false),
                error: stryMutAct_9fa48('407')
                  ? ''
                  : (stryCov_9fa48('407'), 'Invalid message format'),
              });
        }
      }
      try {
        if (stryMutAct_9fa48('408')) {
          {
          }
        } else {
          stryCov_9fa48('408');
          const existingCount = state.responses.length;
          const newResponses = stryMutAct_9fa48('409')
            ? graphResult.nextState.responses
            : (stryCov_9fa48('409'), graphResult.nextState.responses.slice(existingCount));
          if (
            stryMutAct_9fa48('413')
              ? newResponses.length <= 0
              : stryMutAct_9fa48('412')
                ? newResponses.length >= 0
                : stryMutAct_9fa48('411')
                  ? false
                  : stryMutAct_9fa48('410')
                    ? true
                    : (stryCov_9fa48('410', '411', '412', '413'), newResponses.length > 0)
          ) {
            if (stryMutAct_9fa48('414')) {
              {
              }
            } else {
              stryCov_9fa48('414');
              graphResult.nextState.pendingResponses = newResponses;
            }
          }
          await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('415')) {
          {
          }
        } else {
          stryCov_9fa48('415');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('416')
                ? ''
                : (stryCov_9fa48('416'), 'Unknown error');
          if (
            stryMutAct_9fa48('419')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('418')
                ? false
                : stryMutAct_9fa48('417')
                  ? true
                  : (stryCov_9fa48('417', '418', '419'),
                    errorMsg.includes(
                      stryMutAct_9fa48('420') ? '' : (stryCov_9fa48('420'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('423')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('422')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('421')
                            ? true
                            : (stryCov_9fa48('421', '422', '423'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('424')) {
              {
              }
            } else {
              stryCov_9fa48('424');
              return this.processStreamMessage(
                message,
                stryMutAct_9fa48('425') ? retryCount - 1 : (stryCov_9fa48('425'), retryCount + 1)
              );
            }
          }
          return stryMutAct_9fa48('426')
            ? {}
            : (stryCov_9fa48('426'),
              {
                success: stryMutAct_9fa48('427') ? true : (stryCov_9fa48('427'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('429')
          ? false
          : stryMutAct_9fa48('428')
            ? true
            : (stryCov_9fa48('428', '429'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('430')) {
          {
          }
        } else {
          stryCov_9fa48('430');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('431')
        ? {}
        : (stryCov_9fa48('431'),
          {
            success: stryMutAct_9fa48('432') ? false : (stryCov_9fa48('432'), true),
            response: graphResult.response,
          });
    }
  }
  private async resolveDefaultTemplateId(): Promise<string> {
    if (stryMutAct_9fa48('433')) {
      {
      }
    } else {
      stryCov_9fa48('433');
      const repo = new TemplateRepository();
      const templates = await repo.findAll();
      const published = templates.find(
        stryMutAct_9fa48('434')
          ? () => undefined
          : (stryCov_9fa48('434'),
            (t) =>
              stryMutAct_9fa48('437')
                ? t.status !== 'PUBLISHED'
                : stryMutAct_9fa48('436')
                  ? false
                  : stryMutAct_9fa48('435')
                    ? true
                    : (stryCov_9fa48('435', '436', '437'),
                      t.status ===
                        (stryMutAct_9fa48('438') ? '' : (stryCov_9fa48('438'), 'PUBLISHED'))))
      );
      if (
        stryMutAct_9fa48('440')
          ? false
          : stryMutAct_9fa48('439')
            ? true
            : (stryCov_9fa48('439', '440'), published)
      )
        return published.id;
      return (
        stryMutAct_9fa48('444')
          ? templates.length <= 0
          : stryMutAct_9fa48('443')
            ? templates.length >= 0
            : stryMutAct_9fa48('442')
              ? false
              : stryMutAct_9fa48('441')
                ? true
                : (stryCov_9fa48('441', '442', '443', '444'), templates.length > 0)
      )
        ? templates[0].id
        : stryMutAct_9fa48('445')
          ? ''
          : (stryCov_9fa48('445'), 'test-template');
    }
  }
}
export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  if (stryMutAct_9fa48('446')) {
    {
    }
  } else {
    stryCov_9fa48('446');
    try {
      if (stryMutAct_9fa48('447')) {
        {
        }
      } else {
        stryCov_9fa48('447');
        const data = JSON.parse(message.data);
        const content = stryMutAct_9fa48('450')
          ? (data.text?.content || data.content) && ''
          : stryMutAct_9fa48('449')
            ? false
            : stryMutAct_9fa48('448')
              ? true
              : (stryCov_9fa48('448', '449', '450'),
                (stryMutAct_9fa48('452')
                  ? data.text?.content && data.content
                  : stryMutAct_9fa48('451')
                    ? false
                    : (stryCov_9fa48('451', '452'),
                      (stryMutAct_9fa48('453')
                        ? data.text.content
                        : (stryCov_9fa48('453'), data.text?.content)) || data.content)) ||
                  (stryMutAct_9fa48('454') ? 'Stryker was here!' : (stryCov_9fa48('454'), '')));
        return stryMutAct_9fa48('455')
          ? {}
          : (stryCov_9fa48('455'),
            {
              userId: stryMutAct_9fa48('458')
                ? data.senderStaffId && ''
                : stryMutAct_9fa48('457')
                  ? false
                  : stryMutAct_9fa48('456')
                    ? true
                    : (stryCov_9fa48('456', '457', '458'),
                      data.senderStaffId ||
                        (stryMutAct_9fa48('459')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('459'), ''))),
              content: content,
              sessionWebhook: stryMutAct_9fa48('462')
                ? data.sessionWebhook && ''
                : stryMutAct_9fa48('461')
                  ? false
                  : stryMutAct_9fa48('460')
                    ? true
                    : (stryCov_9fa48('460', '461', '462'),
                      data.sessionWebhook ||
                        (stryMutAct_9fa48('463')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('463'), ''))),
              messageId: message.headers.messageId,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('464')) {
        {
        }
      } else {
        stryCov_9fa48('464');
        error(
          stryMutAct_9fa48('465') ? '' : (stryCov_9fa48('465'), 'Failed to parse stream message'),
          stryMutAct_9fa48('466')
            ? {}
            : (stryCov_9fa48('466'),
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
  if (stryMutAct_9fa48('467')) {
    {
    }
  } else {
    stryCov_9fa48('467');
    if (
      stryMutAct_9fa48('470')
        ? false
        : stryMutAct_9fa48('469')
          ? true
          : stryMutAct_9fa48('468')
            ? sessionWebhook
            : (stryCov_9fa48('468', '469', '470'), !sessionWebhook)
    ) {
      if (stryMutAct_9fa48('471')) {
        {
        }
      } else {
        stryCov_9fa48('471');
        error(stryMutAct_9fa48('472') ? '' : (stryCov_9fa48('472'), 'No sessionWebhook provided'));
        return stryMutAct_9fa48('473') ? true : (stryCov_9fa48('473'), false);
      }
    }
    info(
      stryMutAct_9fa48('474') ? '' : (stryCov_9fa48('474'), 'Sending reply (exported)'),
      stryMutAct_9fa48('475')
        ? {}
        : (stryCov_9fa48('475'),
          {
            webhook: sessionWebhook,
            contentLength: content.length,
          })
    );
    try {
      if (stryMutAct_9fa48('476')) {
        {
        }
      } else {
        stryCov_9fa48('476');
        const body = stryMutAct_9fa48('477')
          ? {}
          : (stryCov_9fa48('477'),
            {
              msgtype: stryMutAct_9fa48('478') ? '' : (stryCov_9fa48('478'), 'text'),
              text: stryMutAct_9fa48('479')
                ? {}
                : (stryCov_9fa48('479'),
                  {
                    content,
                  }),
            });
        const response = await fetch(
          sessionWebhook,
          stryMutAct_9fa48('480')
            ? {}
            : (stryCov_9fa48('480'),
              {
                method: stryMutAct_9fa48('481') ? '' : (stryCov_9fa48('481'), 'POST'),
                headers: stryMutAct_9fa48('482')
                  ? {}
                  : (stryCov_9fa48('482'),
                    {
                      'Content-Type': stryMutAct_9fa48('483')
                        ? ''
                        : (stryCov_9fa48('483'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('486')
            ? false
            : stryMutAct_9fa48('485')
              ? true
              : stryMutAct_9fa48('484')
                ? response.ok
                : (stryCov_9fa48('484', '485', '486'), !response.ok)
        ) {
          if (stryMutAct_9fa48('487')) {
            {
            }
          } else {
            stryCov_9fa48('487');
            const responseText = await response.text();
            error(
              stryMutAct_9fa48('488') ? '' : (stryCov_9fa48('488'), 'Failed to send reply'),
              stryMutAct_9fa48('489')
                ? {}
                : (stryCov_9fa48('489'),
                  {
                    status: response.status,
                    statusText: response.statusText,
                    webhook: sessionWebhook,
                    responseText: stryMutAct_9fa48('490')
                      ? responseText
                      : (stryCov_9fa48('490'), responseText.substring(0, 200)),
                  })
            );
            return stryMutAct_9fa48('491') ? true : (stryCov_9fa48('491'), false);
          }
        }
        info(
          stryMutAct_9fa48('492') ? '' : (stryCov_9fa48('492'), 'Reply sent'),
          stryMutAct_9fa48('493')
            ? {}
            : (stryCov_9fa48('493'),
              {
                webhook: sessionWebhook,
                contentLength: content.length,
              })
        );
        return stryMutAct_9fa48('494') ? false : (stryCov_9fa48('494'), true);
      }
    } catch (e) {
      if (stryMutAct_9fa48('495')) {
        {
        }
      } else {
        stryCov_9fa48('495');
        const errMsg = e instanceof Error ? e.message : String(e);
        error(
          stryMutAct_9fa48('496') ? '' : (stryCov_9fa48('496'), 'Failed to send reply'),
          stryMutAct_9fa48('497')
            ? {}
            : (stryCov_9fa48('497'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('498') ? true : (stryCov_9fa48('498'), false);
      }
    }
  }
}
export async function processStreamMessage(message: StreamMessage): Promise<ProcessResult> {
  if (stryMutAct_9fa48('499')) {
    {
    }
  } else {
    stryCov_9fa48('499');
    const service = new StreamMessageService();
    return service.processStreamMessage(message);
  }
}
