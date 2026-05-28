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
    if (stryMutAct_9fa48('3604')) {
      {
      }
    } else {
      stryCov_9fa48('3604');
      this.repo = stryMutAct_9fa48('3607')
        ? repo && new InterviewStateRepository()
        : stryMutAct_9fa48('3606')
          ? false
          : stryMutAct_9fa48('3605')
            ? true
            : (stryCov_9fa48('3605', '3606', '3607'), repo || new InterviewStateRepository());
    }
  }
  parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
    if (stryMutAct_9fa48('3608')) {
      {
      }
    } else {
      stryCov_9fa48('3608');
      try {
        if (stryMutAct_9fa48('3609')) {
          {
          }
        } else {
          stryCov_9fa48('3609');
          info(
            stryMutAct_9fa48('3610') ? '' : (stryCov_9fa48('3610'), 'Parsing stream message'),
            stryMutAct_9fa48('3611')
              ? {}
              : (stryCov_9fa48('3611'),
                {
                  dataLength: stryMutAct_9fa48('3612')
                    ? message.data.length
                    : (stryCov_9fa48('3612'), message.data?.length),
                  hasData: stryMutAct_9fa48('3613')
                    ? !message.data
                    : (stryCov_9fa48('3613'),
                      !(stryMutAct_9fa48('3614')
                        ? message.data
                        : (stryCov_9fa48('3614'), !message.data))),
                })
          );
          const data = JSON.parse(message.data);
          info(
            stryMutAct_9fa48('3615') ? '' : (stryCov_9fa48('3615'), 'Parsed outer data'),
            stryMutAct_9fa48('3616')
              ? {}
              : (stryCov_9fa48('3616'),
                {
                  hasSenderStaffId: stryMutAct_9fa48('3617')
                    ? !data.senderStaffId
                    : (stryCov_9fa48('3617'),
                      !(stryMutAct_9fa48('3618')
                        ? data.senderStaffId
                        : (stryCov_9fa48('3618'), !data.senderStaffId))),
                  hasText: stryMutAct_9fa48('3619')
                    ? !data.text
                    : (stryCov_9fa48('3619'),
                      !(stryMutAct_9fa48('3620')
                        ? data.text
                        : (stryCov_9fa48('3620'), !data.text))),
                  hasContent: stryMutAct_9fa48('3621')
                    ? !data.content
                    : (stryCov_9fa48('3621'),
                      !(stryMutAct_9fa48('3622')
                        ? data.content
                        : (stryCov_9fa48('3622'), !data.content))),
                  hasSessionWebhook: stryMutAct_9fa48('3623')
                    ? !data.sessionWebhook
                    : (stryCov_9fa48('3623'),
                      !(stryMutAct_9fa48('3624')
                        ? data.sessionWebhook
                        : (stryCov_9fa48('3624'), !data.sessionWebhook))),
                  msgtype: data.msgtype,
                })
          );
          const content = stryMutAct_9fa48('3627')
            ? (data.text?.content || data.content) && ''
            : stryMutAct_9fa48('3626')
              ? false
              : stryMutAct_9fa48('3625')
                ? true
                : (stryCov_9fa48('3625', '3626', '3627'),
                  (stryMutAct_9fa48('3629')
                    ? data.text?.content && data.content
                    : stryMutAct_9fa48('3628')
                      ? false
                      : (stryCov_9fa48('3628', '3629'),
                        (stryMutAct_9fa48('3630')
                          ? data.text.content
                          : (stryCov_9fa48('3630'), data.text?.content)) || data.content)) ||
                    (stryMutAct_9fa48('3631') ? 'Stryker was here!' : (stryCov_9fa48('3631'), '')));
          info(
            stryMutAct_9fa48('3632') ? '' : (stryCov_9fa48('3632'), 'Extracted content'),
            stryMutAct_9fa48('3633')
              ? {}
              : (stryCov_9fa48('3633'),
                {
                  contentLength: stryMutAct_9fa48('3634')
                    ? content.length
                    : (stryCov_9fa48('3634'), content?.length),
                  contentPreview: stryMutAct_9fa48('3636')
                    ? content.substring(0, 50)
                    : stryMutAct_9fa48('3635')
                      ? content
                      : (stryCov_9fa48('3635', '3636'), content?.substring(0, 50)),
                })
          );
          return stryMutAct_9fa48('3637')
            ? {}
            : (stryCov_9fa48('3637'),
              {
                userId: stryMutAct_9fa48('3640')
                  ? data.senderStaffId && ''
                  : stryMutAct_9fa48('3639')
                    ? false
                    : stryMutAct_9fa48('3638')
                      ? true
                      : (stryCov_9fa48('3638', '3639', '3640'),
                        data.senderStaffId ||
                          (stryMutAct_9fa48('3641')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('3641'), ''))),
                content: content,
                sessionWebhook: stryMutAct_9fa48('3644')
                  ? data.sessionWebhook && ''
                  : stryMutAct_9fa48('3643')
                    ? false
                    : stryMutAct_9fa48('3642')
                      ? true
                      : (stryCov_9fa48('3642', '3643', '3644'),
                        data.sessionWebhook ||
                          (stryMutAct_9fa48('3645')
                            ? 'Stryker was here!'
                            : (stryCov_9fa48('3645'), ''))),
                messageId: message.headers.messageId,
              });
        }
      } catch (e) {
        if (stryMutAct_9fa48('3646')) {
          {
          }
        } else {
          stryCov_9fa48('3646');
          error(
            stryMutAct_9fa48('3647')
              ? ''
              : (stryCov_9fa48('3647'), 'Failed to parse stream message'),
            stryMutAct_9fa48('3648')
              ? {}
              : (stryCov_9fa48('3648'),
                {
                  error: e instanceof Error ? e.message : String(e),
                  rawData: stryMutAct_9fa48('3650')
                    ? message.data.substring(0, 500)
                    : stryMutAct_9fa48('3649')
                      ? message.data
                      : (stryCov_9fa48('3649', '3650'), message.data?.substring(0, 500)),
                })
          );
          return null;
        }
      }
    }
  }
  async sendReply(sessionWebhook: string, content: string): Promise<boolean> {
    if (stryMutAct_9fa48('3651')) {
      {
      }
    } else {
      stryCov_9fa48('3651');
      if (
        stryMutAct_9fa48('3654')
          ? false
          : stryMutAct_9fa48('3653')
            ? true
            : stryMutAct_9fa48('3652')
              ? sessionWebhook
              : (stryCov_9fa48('3652', '3653', '3654'), !sessionWebhook)
      ) {
        if (stryMutAct_9fa48('3655')) {
          {
          }
        } else {
          stryCov_9fa48('3655');
          error(
            stryMutAct_9fa48('3656') ? '' : (stryCov_9fa48('3656'), 'No sessionWebhook provided')
          );
          return stryMutAct_9fa48('3657') ? true : (stryCov_9fa48('3657'), false);
        }
      }
      info(
        stryMutAct_9fa48('3658') ? '' : (stryCov_9fa48('3658'), 'Sending reply'),
        stryMutAct_9fa48('3659')
          ? {}
          : (stryCov_9fa48('3659'),
            {
              webhook: sessionWebhook,
              contentLength: content.length,
              contentPreview: stryMutAct_9fa48('3660')
                ? content
                : (stryCov_9fa48('3660'), content.substring(0, 50)),
            })
      );
      try {
        if (stryMutAct_9fa48('3661')) {
          {
          }
        } else {
          stryCov_9fa48('3661');
          const body = stryMutAct_9fa48('3662')
            ? {}
            : (stryCov_9fa48('3662'),
              {
                msgtype: stryMutAct_9fa48('3663') ? '' : (stryCov_9fa48('3663'), 'text'),
                text: stryMutAct_9fa48('3664')
                  ? {}
                  : (stryCov_9fa48('3664'),
                    {
                      content,
                    }),
              });
          const response = await fetch(
            sessionWebhook,
            stryMutAct_9fa48('3665')
              ? {}
              : (stryCov_9fa48('3665'),
                {
                  method: stryMutAct_9fa48('3666') ? '' : (stryCov_9fa48('3666'), 'POST'),
                  headers: stryMutAct_9fa48('3667')
                    ? {}
                    : (stryCov_9fa48('3667'),
                      {
                        'Content-Type': stryMutAct_9fa48('3668')
                          ? ''
                          : (stryCov_9fa48('3668'), 'application/json'),
                      }),
                  body: JSON.stringify(body),
                })
          );
          info(
            stryMutAct_9fa48('3669') ? '' : (stryCov_9fa48('3669'), 'Reply response'),
            stryMutAct_9fa48('3670')
              ? {}
              : (stryCov_9fa48('3670'),
                {
                  status: response.status,
                  statusText: response.statusText,
                  ok: response.ok,
                })
          );
          if (
            stryMutAct_9fa48('3673')
              ? false
              : stryMutAct_9fa48('3672')
                ? true
                : stryMutAct_9fa48('3671')
                  ? response.ok
                  : (stryCov_9fa48('3671', '3672', '3673'), !response.ok)
          ) {
            if (stryMutAct_9fa48('3674')) {
              {
              }
            } else {
              stryCov_9fa48('3674');
              const responseText = await response.text();
              error(
                stryMutAct_9fa48('3675') ? '' : (stryCov_9fa48('3675'), 'Failed to send reply'),
                stryMutAct_9fa48('3676')
                  ? {}
                  : (stryCov_9fa48('3676'),
                    {
                      status: response.status,
                      statusText: response.statusText,
                      webhook: sessionWebhook,
                      responseText: stryMutAct_9fa48('3677')
                        ? responseText
                        : (stryCov_9fa48('3677'), responseText.substring(0, 200)),
                    })
              );
              return stryMutAct_9fa48('3678') ? true : (stryCov_9fa48('3678'), false);
            }
          }
          info(
            stryMutAct_9fa48('3679') ? '' : (stryCov_9fa48('3679'), 'Reply sent successfully'),
            stryMutAct_9fa48('3680')
              ? {}
              : (stryCov_9fa48('3680'),
                {
                  webhook: sessionWebhook,
                  contentLength: content.length,
                })
          );
          return stryMutAct_9fa48('3681') ? false : (stryCov_9fa48('3681'), true);
        }
      } catch (e) {
        if (stryMutAct_9fa48('3682')) {
          {
          }
        } else {
          stryCov_9fa48('3682');
          const errMsg = e instanceof Error ? e.message : String(e);
          error(
            stryMutAct_9fa48('3683') ? '' : (stryCov_9fa48('3683'), 'Failed to send reply'),
            stryMutAct_9fa48('3684')
              ? {}
              : (stryCov_9fa48('3684'),
                {
                  error: errMsg,
                })
          );
          return stryMutAct_9fa48('3685') ? true : (stryCov_9fa48('3685'), false);
        }
      }
    }
  }
  async processStreamMessage(message: StreamMessage, retryCount = 0): Promise<ProcessResult> {
    if (stryMutAct_9fa48('3686')) {
      {
      }
    } else {
      stryCov_9fa48('3686');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('3689')
          ? false
          : stryMutAct_9fa48('3688')
            ? true
            : stryMutAct_9fa48('3687')
              ? parsed
              : (stryCov_9fa48('3687', '3688', '3689'), !parsed)
      ) {
        if (stryMutAct_9fa48('3690')) {
          {
          }
        } else {
          stryCov_9fa48('3690');
          error(
            stryMutAct_9fa48('3691')
              ? ''
              : (stryCov_9fa48('3691'), 'Message parse failed - invalid format'),
            stryMutAct_9fa48('3692')
              ? {}
              : (stryCov_9fa48('3692'),
                {
                  data: stryMutAct_9fa48('3694')
                    ? message.data.substring(0, 200)
                    : stryMutAct_9fa48('3693')
                      ? message.data
                      : (stryCov_9fa48('3693', '3694'), message.data?.substring(0, 200)),
                })
          );
          return stryMutAct_9fa48('3695')
            ? {}
            : (stryCov_9fa48('3695'),
              {
                success: stryMutAct_9fa48('3696') ? true : (stryCov_9fa48('3696'), false),
                error: stryMutAct_9fa48('3697')
                  ? ''
                  : (stryCov_9fa48('3697'), 'Invalid message format'),
              });
        }
      }
      if (
        stryMutAct_9fa48('3700')
          ? !parsed.userId && !parsed.content
          : stryMutAct_9fa48('3699')
            ? false
            : stryMutAct_9fa48('3698')
              ? true
              : (stryCov_9fa48('3698', '3699', '3700'),
                (stryMutAct_9fa48('3701')
                  ? parsed.userId
                  : (stryCov_9fa48('3701'), !parsed.userId)) ||
                  (stryMutAct_9fa48('3702')
                    ? parsed.content
                    : (stryCov_9fa48('3702'), !parsed.content)))
      ) {
        if (stryMutAct_9fa48('3703')) {
          {
          }
        } else {
          stryCov_9fa48('3703');
          error(
            stryMutAct_9fa48('3704')
              ? ''
              : (stryCov_9fa48('3704'), 'Message missing required fields'),
            stryMutAct_9fa48('3705')
              ? {}
              : (stryCov_9fa48('3705'),
                {
                  userId: parsed.userId,
                  content: stryMutAct_9fa48('3707')
                    ? parsed.content.substring(0, 100)
                    : stryMutAct_9fa48('3706')
                      ? parsed.content
                      : (stryCov_9fa48('3706', '3707'), parsed.content?.substring(0, 100)),
                })
          );
          return stryMutAct_9fa48('3708')
            ? {}
            : (stryCov_9fa48('3708'),
              {
                success: stryMutAct_9fa48('3709') ? true : (stryCov_9fa48('3709'), false),
                error: stryMutAct_9fa48('3710')
                  ? ''
                  : (stryCov_9fa48('3710'), 'Missing userId or content'),
              });
        }
      }
      info(
        stryMutAct_9fa48('3711') ? '' : (stryCov_9fa48('3711'), 'Processing stream message'),
        stryMutAct_9fa48('3712')
          ? {}
          : (stryCov_9fa48('3712'),
            {
              userId: parsed.userId,
              content: parsed.content,
              messageId: parsed.messageId,
            })
      );
      let state = await this.repo.findActiveInterview(parsed.userId);
      if (
        stryMutAct_9fa48('3715')
          ? false
          : stryMutAct_9fa48('3714')
            ? true
            : stryMutAct_9fa48('3713')
              ? state
              : (stryCov_9fa48('3713', '3714', '3715'), !state)
      ) {
        if (stryMutAct_9fa48('3716')) {
          {
          }
        } else {
          stryCov_9fa48('3716');
          const templateId = await this.resolveDefaultTemplateId();
          const interviewId = await this.repo.createInterview(parsed.userId, templateId);
          state = stryMutAct_9fa48('3717')
            ? {}
            : (stryCov_9fa48('3717'),
              {
                userId: parsed.userId,
                interviewId,
                templateId,
                status: stryMutAct_9fa48('3718') ? '' : (stryCov_9fa48('3718'), 'PENDING'),
                messages: stryMutAct_9fa48('3719')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3719'), []),
                currentQuestion: 0,
                followupCount: 0,
                maxFollowups: 2,
                responses: stryMutAct_9fa48('3720')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3720'), []),
                reportGenerated: stryMutAct_9fa48('3721') ? true : (stryCov_9fa48('3721'), false),
                version: 1,
                originalVersion: 1,
                pendingMessages: stryMutAct_9fa48('3722')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3722'), []),
                pendingResponses: stryMutAct_9fa48('3723')
                  ? ['Stryker was here']
                  : (stryCov_9fa48('3723'), []),
              });
        }
      }
      state.pendingMessages.push(
        stryMutAct_9fa48('3724')
          ? {}
          : (stryCov_9fa48('3724'),
            {
              role: stryMutAct_9fa48('3725') ? '' : (stryCov_9fa48('3725'), 'user'),
              content: parsed.content,
              isVoice: stryMutAct_9fa48('3726') ? true : (stryCov_9fa48('3726'), false),
            })
      );

      // Resolve userName for personalization if not already in state
      if (
        stryMutAct_9fa48('3729')
          ? false
          : stryMutAct_9fa48('3728')
            ? true
            : stryMutAct_9fa48('3727')
              ? state.userName
              : (stryCov_9fa48('3727', '3728', '3729'), !state.userName)
      ) {
        if (stryMutAct_9fa48('3730')) {
          {
          }
        } else {
          stryCov_9fa48('3730');
          const prisma = new PrismaClient();
          try {
            if (stryMutAct_9fa48('3731')) {
              {
              }
            } else {
              stryCov_9fa48('3731');
              // Check for any interview belonging to this user to find the planId
              const interview = await prisma.interview.findFirst(
                stryMutAct_9fa48('3732')
                  ? {}
                  : (stryCov_9fa48('3732'),
                    {
                      where: stryMutAct_9fa48('3733')
                        ? {}
                        : (stryCov_9fa48('3733'),
                          {
                            userId: parsed.userId,
                          }),
                      select: stryMutAct_9fa48('3734')
                        ? {}
                        : (stryCov_9fa48('3734'),
                          {
                            planId: stryMutAct_9fa48('3735')
                              ? false
                              : (stryCov_9fa48('3735'), true),
                          }),
                    })
              );
              if (
                stryMutAct_9fa48('3738')
                  ? interview.planId
                  : stryMutAct_9fa48('3737')
                    ? false
                    : stryMutAct_9fa48('3736')
                      ? true
                      : (stryCov_9fa48('3736', '3737', '3738'), interview?.planId)
              ) {
                if (stryMutAct_9fa48('3739')) {
                  {
                  }
                } else {
                  stryCov_9fa48('3739');
                  const plan = await prisma.interviewPlan.findUnique(
                    stryMutAct_9fa48('3740')
                      ? {}
                      : (stryCov_9fa48('3740'),
                        {
                          where: stryMutAct_9fa48('3741')
                            ? {}
                            : (stryCov_9fa48('3741'),
                              {
                                id: interview.planId,
                              }),
                          select: stryMutAct_9fa48('3742')
                            ? {}
                            : (stryCov_9fa48('3742'),
                              {
                                inviteeData: stryMutAct_9fa48('3743')
                                  ? false
                                  : (stryCov_9fa48('3743'), true),
                              }),
                        })
                  );
                  if (
                    stryMutAct_9fa48('3746')
                      ? plan.inviteeData
                      : stryMutAct_9fa48('3745')
                        ? false
                        : stryMutAct_9fa48('3744')
                          ? true
                          : (stryCov_9fa48('3744', '3745', '3746'), plan?.inviteeData)
                  ) {
                    if (stryMutAct_9fa48('3747')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('3747');
                      const invitees = plan.inviteeData as {
                        userId: string;
                        name?: string;
                      }[];
                      const matched = invitees.find(
                        stryMutAct_9fa48('3748')
                          ? () => undefined
                          : (stryCov_9fa48('3748'),
                            (inv) =>
                              stryMutAct_9fa48('3751')
                                ? inv.userId !== parsed.userId
                                : stryMutAct_9fa48('3750')
                                  ? false
                                  : stryMutAct_9fa48('3749')
                                    ? true
                                    : (stryCov_9fa48('3749', '3750', '3751'),
                                      inv.userId === parsed.userId))
                      );
                      if (
                        stryMutAct_9fa48('3754')
                          ? matched.name
                          : stryMutAct_9fa48('3753')
                            ? false
                            : stryMutAct_9fa48('3752')
                              ? true
                              : (stryCov_9fa48('3752', '3753', '3754'), matched?.name)
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
            if (stryMutAct_9fa48('3755')) {
              {
              }
            } else {
              stryCov_9fa48('3755');
              await prisma.$disconnect();
            }
          }
        }
      }
      const graphResult: GraphResult = await runInterviewGraph(
        state,
        stryMutAct_9fa48('3756')
          ? {}
          : (stryCov_9fa48('3756'),
            {
              userId: parsed.userId,
              content: parsed.content,
              isVoice: stryMutAct_9fa48('3757') ? true : (stryCov_9fa48('3757'), false),
            })
      );
      const nextState = graphResult.nextState;
      // Persist only newly added responses to the Response table (diff against what was loaded from DB)
      const existingCount = state.responses.length;
      const newResponses = stryMutAct_9fa48('3758')
        ? nextState.responses
        : (stryCov_9fa48('3758'), nextState.responses.slice(existingCount));
      if (
        stryMutAct_9fa48('3762')
          ? newResponses.length <= 0
          : stryMutAct_9fa48('3761')
            ? newResponses.length >= 0
            : stryMutAct_9fa48('3760')
              ? false
              : stryMutAct_9fa48('3759')
                ? true
                : (stryCov_9fa48('3759', '3760', '3761', '3762'), newResponses.length > 0)
      ) {
        if (stryMutAct_9fa48('3763')) {
          {
          }
        } else {
          stryCov_9fa48('3763');
          nextState.pendingResponses = newResponses;
        }
      }
      nextState.pendingMessages.push(
        stryMutAct_9fa48('3764')
          ? {}
          : (stryCov_9fa48('3764'),
            {
              role: stryMutAct_9fa48('3765') ? '' : (stryCov_9fa48('3765'), 'assistant'),
              content: graphResult.response,
              isVoice: stryMutAct_9fa48('3766') ? true : (stryCov_9fa48('3766'), false),
            })
      );
      try {
        if (stryMutAct_9fa48('3767')) {
          {
          }
        } else {
          stryCov_9fa48('3767');
          await this.repo.saveFullState(state.interviewId as string, nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('3768')) {
          {
          }
        } else {
          stryCov_9fa48('3768');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('3769')
                ? ''
                : (stryCov_9fa48('3769'), 'Unknown error');
          if (
            stryMutAct_9fa48('3772')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('3771')
                ? false
                : stryMutAct_9fa48('3770')
                  ? true
                  : (stryCov_9fa48('3770', '3771', '3772'),
                    errorMsg.includes(
                      stryMutAct_9fa48('3773') ? '' : (stryCov_9fa48('3773'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('3776')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('3775')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('3774')
                            ? true
                            : (stryCov_9fa48('3774', '3775', '3776'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('3777')) {
              {
              }
            } else {
              stryCov_9fa48('3777');
              info(
                stryMutAct_9fa48('3778')
                  ? ''
                  : (stryCov_9fa48('3778'), 'Retrying due to version conflict'),
                stryMutAct_9fa48('3779')
                  ? {}
                  : (stryCov_9fa48('3779'),
                    {
                      userId: parsed.userId,
                      retryCount: stryMutAct_9fa48('3780')
                        ? retryCount - 1
                        : (stryCov_9fa48('3780'), retryCount + 1),
                    })
              );
              const freshState = await this.repo.loadFullState(
                state.interviewId as string,
                parsed.userId
              );
              if (
                stryMutAct_9fa48('3782')
                  ? false
                  : stryMutAct_9fa48('3781')
                    ? true
                    : (stryCov_9fa48('3781', '3782'), freshState)
              ) {
                if (stryMutAct_9fa48('3783')) {
                  {
                  }
                } else {
                  stryCov_9fa48('3783');
                  freshState.pendingMessages = stryMutAct_9fa48('3784')
                    ? []
                    : (stryCov_9fa48('3784'),
                      [
                        stryMutAct_9fa48('3785')
                          ? {}
                          : (stryCov_9fa48('3785'),
                            {
                              role: stryMutAct_9fa48('3786') ? '' : (stryCov_9fa48('3786'), 'user'),
                              content: parsed.content,
                              isVoice: stryMutAct_9fa48('3787')
                                ? true
                                : (stryCov_9fa48('3787'), false),
                            }),
                      ]);
                  const retryGraphResult = await runInterviewGraph(
                    freshState,
                    stryMutAct_9fa48('3788')
                      ? {}
                      : (stryCov_9fa48('3788'),
                        {
                          userId: parsed.userId,
                          content: parsed.content,
                          isVoice: stryMutAct_9fa48('3789') ? true : (stryCov_9fa48('3789'), false),
                        })
                  );
                  const retryExistingCount = freshState.responses.length;
                  const retryNewResponses = stryMutAct_9fa48('3790')
                    ? retryGraphResult.nextState.responses
                    : (stryCov_9fa48('3790'),
                      retryGraphResult.nextState.responses.slice(retryExistingCount));
                  if (
                    stryMutAct_9fa48('3794')
                      ? retryNewResponses.length <= 0
                      : stryMutAct_9fa48('3793')
                        ? retryNewResponses.length >= 0
                        : stryMutAct_9fa48('3792')
                          ? false
                          : stryMutAct_9fa48('3791')
                            ? true
                            : (stryCov_9fa48('3791', '3792', '3793', '3794'),
                              retryNewResponses.length > 0)
                  ) {
                    if (stryMutAct_9fa48('3795')) {
                      {
                      }
                    } else {
                      stryCov_9fa48('3795');
                      retryGraphResult.nextState.pendingResponses = retryNewResponses;
                    }
                  }
                  retryGraphResult.nextState.pendingMessages.push(
                    stryMutAct_9fa48('3796')
                      ? {}
                      : (stryCov_9fa48('3796'),
                        {
                          role: stryMutAct_9fa48('3797')
                            ? ''
                            : (stryCov_9fa48('3797'), 'assistant'),
                          content: retryGraphResult.response,
                          isVoice: stryMutAct_9fa48('3798') ? true : (stryCov_9fa48('3798'), false),
                        })
                  );
                  return this.processStreamMessageWithState(
                    message,
                    retryGraphResult,
                    freshState,
                    stryMutAct_9fa48('3799')
                      ? retryCount - 1
                      : (stryCov_9fa48('3799'), retryCount + 1)
                  );
                }
              }
            }
          }
          return stryMutAct_9fa48('3800')
            ? {}
            : (stryCov_9fa48('3800'),
              {
                success: stryMutAct_9fa48('3801') ? true : (stryCov_9fa48('3801'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('3803')
          ? false
          : stryMutAct_9fa48('3802')
            ? true
            : (stryCov_9fa48('3802', '3803'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('3804')) {
          {
          }
        } else {
          stryCov_9fa48('3804');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('3805')
        ? {}
        : (stryCov_9fa48('3805'),
          {
            success: stryMutAct_9fa48('3806') ? false : (stryCov_9fa48('3806'), true),
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
    if (stryMutAct_9fa48('3807')) {
      {
      }
    } else {
      stryCov_9fa48('3807');
      const parsed = this.parseStreamMessage(message);
      if (
        stryMutAct_9fa48('3810')
          ? false
          : stryMutAct_9fa48('3809')
            ? true
            : stryMutAct_9fa48('3808')
              ? parsed
              : (stryCov_9fa48('3808', '3809', '3810'), !parsed)
      ) {
        if (stryMutAct_9fa48('3811')) {
          {
          }
        } else {
          stryCov_9fa48('3811');
          return stryMutAct_9fa48('3812')
            ? {}
            : (stryCov_9fa48('3812'),
              {
                success: stryMutAct_9fa48('3813') ? true : (stryCov_9fa48('3813'), false),
                error: stryMutAct_9fa48('3814')
                  ? ''
                  : (stryCov_9fa48('3814'), 'Invalid message format'),
              });
        }
      }
      try {
        if (stryMutAct_9fa48('3815')) {
          {
          }
        } else {
          stryCov_9fa48('3815');
          const existingCount = state.responses.length;
          const newResponses = stryMutAct_9fa48('3816')
            ? graphResult.nextState.responses
            : (stryCov_9fa48('3816'), graphResult.nextState.responses.slice(existingCount));
          if (
            stryMutAct_9fa48('3820')
              ? newResponses.length <= 0
              : stryMutAct_9fa48('3819')
                ? newResponses.length >= 0
                : stryMutAct_9fa48('3818')
                  ? false
                  : stryMutAct_9fa48('3817')
                    ? true
                    : (stryCov_9fa48('3817', '3818', '3819', '3820'), newResponses.length > 0)
          ) {
            if (stryMutAct_9fa48('3821')) {
              {
              }
            } else {
              stryCov_9fa48('3821');
              graphResult.nextState.pendingResponses = newResponses;
            }
          }
          await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
        }
      } catch (err) {
        if (stryMutAct_9fa48('3822')) {
          {
          }
        } else {
          stryCov_9fa48('3822');
          const errorMsg =
            err instanceof Error
              ? err.message
              : stryMutAct_9fa48('3823')
                ? ''
                : (stryCov_9fa48('3823'), 'Unknown error');
          if (
            stryMutAct_9fa48('3826')
              ? errorMsg.includes('Version conflict') || retryCount < MAX_RETRIES
              : stryMutAct_9fa48('3825')
                ? false
                : stryMutAct_9fa48('3824')
                  ? true
                  : (stryCov_9fa48('3824', '3825', '3826'),
                    errorMsg.includes(
                      stryMutAct_9fa48('3827') ? '' : (stryCov_9fa48('3827'), 'Version conflict')
                    ) &&
                      (stryMutAct_9fa48('3830')
                        ? retryCount >= MAX_RETRIES
                        : stryMutAct_9fa48('3829')
                          ? retryCount <= MAX_RETRIES
                          : stryMutAct_9fa48('3828')
                            ? true
                            : (stryCov_9fa48('3828', '3829', '3830'), retryCount < MAX_RETRIES)))
          ) {
            if (stryMutAct_9fa48('3831')) {
              {
              }
            } else {
              stryCov_9fa48('3831');
              return this.processStreamMessage(
                message,
                stryMutAct_9fa48('3832') ? retryCount - 1 : (stryCov_9fa48('3832'), retryCount + 1)
              );
            }
          }
          return stryMutAct_9fa48('3833')
            ? {}
            : (stryCov_9fa48('3833'),
              {
                success: stryMutAct_9fa48('3834') ? true : (stryCov_9fa48('3834'), false),
                error: errorMsg,
              });
        }
      }
      if (
        stryMutAct_9fa48('3836')
          ? false
          : stryMutAct_9fa48('3835')
            ? true
            : (stryCov_9fa48('3835', '3836'), parsed.sessionWebhook)
      ) {
        if (stryMutAct_9fa48('3837')) {
          {
          }
        } else {
          stryCov_9fa48('3837');
          await this.sendReply(parsed.sessionWebhook, graphResult.response);
        }
      }
      return stryMutAct_9fa48('3838')
        ? {}
        : (stryCov_9fa48('3838'),
          {
            success: stryMutAct_9fa48('3839') ? false : (stryCov_9fa48('3839'), true),
            response: graphResult.response,
          });
    }
  }
  private async resolveDefaultTemplateId(): Promise<string> {
    if (stryMutAct_9fa48('3840')) {
      {
      }
    } else {
      stryCov_9fa48('3840');
      const repo = new TemplateRepository();
      const templates = await repo.findAll();
      const published = templates.find(
        stryMutAct_9fa48('3841')
          ? () => undefined
          : (stryCov_9fa48('3841'),
            (t) =>
              stryMutAct_9fa48('3844')
                ? t.status !== 'PUBLISHED'
                : stryMutAct_9fa48('3843')
                  ? false
                  : stryMutAct_9fa48('3842')
                    ? true
                    : (stryCov_9fa48('3842', '3843', '3844'),
                      t.status ===
                        (stryMutAct_9fa48('3845') ? '' : (stryCov_9fa48('3845'), 'PUBLISHED'))))
      );
      if (
        stryMutAct_9fa48('3847')
          ? false
          : stryMutAct_9fa48('3846')
            ? true
            : (stryCov_9fa48('3846', '3847'), published)
      )
        return published.id;
      return (
        stryMutAct_9fa48('3851')
          ? templates.length <= 0
          : stryMutAct_9fa48('3850')
            ? templates.length >= 0
            : stryMutAct_9fa48('3849')
              ? false
              : stryMutAct_9fa48('3848')
                ? true
                : (stryCov_9fa48('3848', '3849', '3850', '3851'), templates.length > 0)
      )
        ? templates[0].id
        : stryMutAct_9fa48('3852')
          ? ''
          : (stryCov_9fa48('3852'), 'test-template');
    }
  }
}
export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  if (stryMutAct_9fa48('3853')) {
    {
    }
  } else {
    stryCov_9fa48('3853');
    try {
      if (stryMutAct_9fa48('3854')) {
        {
        }
      } else {
        stryCov_9fa48('3854');
        const data = JSON.parse(message.data);
        const content = stryMutAct_9fa48('3857')
          ? (data.text?.content || data.content) && ''
          : stryMutAct_9fa48('3856')
            ? false
            : stryMutAct_9fa48('3855')
              ? true
              : (stryCov_9fa48('3855', '3856', '3857'),
                (stryMutAct_9fa48('3859')
                  ? data.text?.content && data.content
                  : stryMutAct_9fa48('3858')
                    ? false
                    : (stryCov_9fa48('3858', '3859'),
                      (stryMutAct_9fa48('3860')
                        ? data.text.content
                        : (stryCov_9fa48('3860'), data.text?.content)) || data.content)) ||
                  (stryMutAct_9fa48('3861') ? 'Stryker was here!' : (stryCov_9fa48('3861'), '')));
        return stryMutAct_9fa48('3862')
          ? {}
          : (stryCov_9fa48('3862'),
            {
              userId: stryMutAct_9fa48('3865')
                ? data.senderStaffId && ''
                : stryMutAct_9fa48('3864')
                  ? false
                  : stryMutAct_9fa48('3863')
                    ? true
                    : (stryCov_9fa48('3863', '3864', '3865'),
                      data.senderStaffId ||
                        (stryMutAct_9fa48('3866')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('3866'), ''))),
              content: content,
              sessionWebhook: stryMutAct_9fa48('3869')
                ? data.sessionWebhook && ''
                : stryMutAct_9fa48('3868')
                  ? false
                  : stryMutAct_9fa48('3867')
                    ? true
                    : (stryCov_9fa48('3867', '3868', '3869'),
                      data.sessionWebhook ||
                        (stryMutAct_9fa48('3870')
                          ? 'Stryker was here!'
                          : (stryCov_9fa48('3870'), ''))),
              messageId: message.headers.messageId,
            });
      }
    } catch (e) {
      if (stryMutAct_9fa48('3871')) {
        {
        }
      } else {
        stryCov_9fa48('3871');
        error(
          stryMutAct_9fa48('3872') ? '' : (stryCov_9fa48('3872'), 'Failed to parse stream message'),
          stryMutAct_9fa48('3873')
            ? {}
            : (stryCov_9fa48('3873'),
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
  if (stryMutAct_9fa48('3874')) {
    {
    }
  } else {
    stryCov_9fa48('3874');
    if (
      stryMutAct_9fa48('3877')
        ? false
        : stryMutAct_9fa48('3876')
          ? true
          : stryMutAct_9fa48('3875')
            ? sessionWebhook
            : (stryCov_9fa48('3875', '3876', '3877'), !sessionWebhook)
    ) {
      if (stryMutAct_9fa48('3878')) {
        {
        }
      } else {
        stryCov_9fa48('3878');
        error(
          stryMutAct_9fa48('3879') ? '' : (stryCov_9fa48('3879'), 'No sessionWebhook provided')
        );
        return stryMutAct_9fa48('3880') ? true : (stryCov_9fa48('3880'), false);
      }
    }
    info(
      stryMutAct_9fa48('3881') ? '' : (stryCov_9fa48('3881'), 'Sending reply (exported)'),
      stryMutAct_9fa48('3882')
        ? {}
        : (stryCov_9fa48('3882'),
          {
            webhook: sessionWebhook,
            contentLength: content.length,
          })
    );
    try {
      if (stryMutAct_9fa48('3883')) {
        {
        }
      } else {
        stryCov_9fa48('3883');
        const body = stryMutAct_9fa48('3884')
          ? {}
          : (stryCov_9fa48('3884'),
            {
              msgtype: stryMutAct_9fa48('3885') ? '' : (stryCov_9fa48('3885'), 'text'),
              text: stryMutAct_9fa48('3886')
                ? {}
                : (stryCov_9fa48('3886'),
                  {
                    content,
                  }),
            });
        const response = await fetch(
          sessionWebhook,
          stryMutAct_9fa48('3887')
            ? {}
            : (stryCov_9fa48('3887'),
              {
                method: stryMutAct_9fa48('3888') ? '' : (stryCov_9fa48('3888'), 'POST'),
                headers: stryMutAct_9fa48('3889')
                  ? {}
                  : (stryCov_9fa48('3889'),
                    {
                      'Content-Type': stryMutAct_9fa48('3890')
                        ? ''
                        : (stryCov_9fa48('3890'), 'application/json'),
                    }),
                body: JSON.stringify(body),
              })
        );
        if (
          stryMutAct_9fa48('3893')
            ? false
            : stryMutAct_9fa48('3892')
              ? true
              : stryMutAct_9fa48('3891')
                ? response.ok
                : (stryCov_9fa48('3891', '3892', '3893'), !response.ok)
        ) {
          if (stryMutAct_9fa48('3894')) {
            {
            }
          } else {
            stryCov_9fa48('3894');
            const responseText = await response.text();
            error(
              stryMutAct_9fa48('3895') ? '' : (stryCov_9fa48('3895'), 'Failed to send reply'),
              stryMutAct_9fa48('3896')
                ? {}
                : (stryCov_9fa48('3896'),
                  {
                    status: response.status,
                    statusText: response.statusText,
                    webhook: sessionWebhook,
                    responseText: stryMutAct_9fa48('3897')
                      ? responseText
                      : (stryCov_9fa48('3897'), responseText.substring(0, 200)),
                  })
            );
            return stryMutAct_9fa48('3898') ? true : (stryCov_9fa48('3898'), false);
          }
        }
        info(
          stryMutAct_9fa48('3899') ? '' : (stryCov_9fa48('3899'), 'Reply sent'),
          stryMutAct_9fa48('3900')
            ? {}
            : (stryCov_9fa48('3900'),
              {
                webhook: sessionWebhook,
                contentLength: content.length,
              })
        );
        return stryMutAct_9fa48('3901') ? false : (stryCov_9fa48('3901'), true);
      }
    } catch (e) {
      if (stryMutAct_9fa48('3902')) {
        {
        }
      } else {
        stryCov_9fa48('3902');
        const errMsg = e instanceof Error ? e.message : String(e);
        error(
          stryMutAct_9fa48('3903') ? '' : (stryCov_9fa48('3903'), 'Failed to send reply'),
          stryMutAct_9fa48('3904')
            ? {}
            : (stryCov_9fa48('3904'),
              {
                error: errMsg,
              })
        );
        return stryMutAct_9fa48('3905') ? true : (stryCov_9fa48('3905'), false);
      }
    }
  }
}
export async function processStreamMessage(message: StreamMessage): Promise<ProcessResult> {
  if (stryMutAct_9fa48('3906')) {
    {
    }
  } else {
    stryCov_9fa48('3906');
    const service = new StreamMessageService();
    return service.processStreamMessage(message);
  }
}
