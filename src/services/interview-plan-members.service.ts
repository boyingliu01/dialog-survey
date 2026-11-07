import { DEFAULT_MAX_FOLLOWUPS } from '../core/types/index.js';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import type { DingTalkStreamClient } from '../integrations/dingtalk/stream-client.js';
import type { TokenManager } from '../integrations/dingtalk/token-manager.js';
import { error, info } from '../utils/logger.js';
import { maskPhone } from '../utils/pii-anonymizer.js';
import { SendStatus } from '../utils/prisma-client.js';
import type { Prisma, PrismaClient } from '../utils/prisma-client.js';
import type { InviteeData } from './interview-plan-base.service.js';
import { InterviewPlanSendService } from './interview-plan-send.service.js';
import { verifyPhoneToName } from './member-verification.service.js';
import { TERMINAL_INTERVIEW_STATUSES } from './plan-completion.service.js';

/**
 * Read `plan.inviteeData` as an invitee list. The column is untyped JSON, so a
 * legacy or hand-edited plan can hold anything; treat a non-array as empty
 * rather than letting `[].find` throw on the caller's happy path.
 */
function inviteesOf(plan: { inviteeData: unknown }): InviteeData[] {
  const raw = plan.inviteeData;
  if (!Array.isArray(raw)) return [];
  return raw as InviteeData[];
}

/** Find an existing invitee whose phone normalizes to the same value. */
function findByPhone(invitees: InviteeData[], normalizedPhone: string): InviteeData | undefined {
  return invitees.find(
    (inv) => inv.phone !== undefined && normalizePhone(inv.phone) === normalizedPhone
  );
}

/**
 * Append one invitee, storing the phone ONLY in phone mode.
 *
 * A userId-only add deliberately records no phone: the caller never proved that
 * number belongs to this person, and storing it would make the phone-conflict
 * check below reject a later, properly verified add of the same person.
 */
function withInvitee(
  invitees: InviteeData[],
  userId: string,
  name: string | undefined,
  phone: string | undefined
): InviteeData[] {
  const invitee = phone ? { userId, name, phone: normalizePhone(phone) } : { userId, name };
  return [...invitees, invitee as InviteeData];
}

export class PlanNotFoundError extends Error {
  readonly code = 'PLAN_NOT_FOUND' as const;
  constructor(planId: string) {
    super(`Plan not found: ${planId}`);
    this.name = 'PlanNotFoundError';
  }
}

export class InterviewNotFoundError extends Error {
  readonly code = 'INTERVIEW_NOT_FOUND' as const;
  constructor(interviewId: string) {
    super(`Interview not found: ${interviewId}`);
    this.name = 'InterviewNotFoundError';
  }
}

export class MemberConflictError extends Error {
  readonly code = 'MEMBER_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MemberConflictError';
  }
}

export class MemberNotFoundError extends Error {
  readonly code = 'MEMBER_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MemberNotFoundError';
  }
}

export class InvalidMemberInputError extends Error {
  readonly code = 'INVALID_MEMBER_INPUT' as const;
  /** Machine-readable cause, when the caller can supply one (see issue #198). */
  readonly failure?: string;
  constructor(message: string, failure?: string) {
    super(message);
    this.name = 'InvalidMemberInputError';
    if (failure !== undefined) this.failure = failure;
  }
}

export class InvalidStateError extends Error {
  readonly code = 'INVALID_STATE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

function normalizePhone(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If starts with 86 and has 13 digits (86 + 11-digit mobile), strip country code
  if (digits.startsWith('86') && digits.length === 13) {
    return digits.slice(2);
  }
  return digits;
}

export interface AddMemberInput {
  userId?: string;
  phone?: string;
  name?: string;
}

/**
 * Resolve who is being added, verifying a phone through DingTalk when that is
 * all the caller supplied.
 *
 * A userId is trusted as-is and the phone is then ignored entirely -- that is
 * the "I already know who this is" path, and it must not be turned into a
 * DingTalk lookup. A phone has to be verified before it becomes an identity;
 * an unverifiable one is a user-facing input error, not a silent skip.
 */
/**
 * Verify a phone through DingTalk and return the identity it resolves to.
 *
 * Every failure is a distinct user-facing input error, which is why they are
 * separate throws rather than one generic rejection: the admin needs to know
 * whether the number is unknown, unverifiable, or verified-but-identityless.
 */
async function verifyPhoneIdentity(
  client: DingTalkClient,
  phone: string,
  name: string | undefined
): Promise<{ userId: string; name: string | undefined }> {
  const result = await verifyPhoneToName(client, phone, name);
  if (!result.verified) {
    throw new InvalidMemberInputError(
      result.reason || `Failed to verify phone ${maskPhone(phone)}`,
      result.failure
    );
  }
  if (!result.userId) {
    throw new InvalidMemberInputError('手机号验证失败，未获取到用户身份');
  }
  // The verified name wins over the caller's spelling, which is only a fallback
  // for the case where DingTalk has no name on file.
  return { userId: result.userId, name: result.name || name };
}

/**
 * Resolve who is being added, verifying a phone through DingTalk when that is
 * all the caller supplied.
 *
 * A userId is trusted as-is and the phone is then ignored entirely -- that is
 * the "I already know who this is" path, and it must not be turned into a
 * DingTalk lookup.
 */
async function resolveMemberIdentity(
  client: DingTalkClient,
  input: AddMemberInput
): Promise<{ userId: string; name: string | undefined }> {
  if (input.userId) return { userId: input.userId, name: input.name };
  if (!input.phone) throw new InvalidMemberInputError('请填写钉钉 ID 或手机号');
  return verifyPhoneIdentity(client, input.phone, input.name);
}

/** The transaction handle type, derived from the client so it cannot drift. */
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Reject a member who would collide with an existing interview.
 *
 * Three separate rules, all error conditions: the same user already in THIS plan,
 * the same user with an unfinished interview in another plan (adding them would
 * split one person's responses across two plans), and the same phone already in
 * this plan's invitee list. The phone rule only applies when the caller supplied
 * a phone, because a userId-only add has no phone to compare.
 */
async function assertNoMemberConflict(
  tx: Tx,
  planId: string,
  userId: string,
  phone: string | undefined,
  plan: { inviteeData: unknown }
): Promise<void> {
  const existing = await tx.interview.findFirst({ where: { planId, userId } });
  if (existing) throw new MemberConflictError('该成员已在访谈计划中');

  const activeElsewhere = await tx.interview.findFirst({
    where: {
      userId,
      planId: { not: planId },
      status: { notIn: [...TERMINAL_INTERVIEW_STATUSES] },
    },
    select: { planId: true },
  });
  if (activeElsewhere) throw new MemberConflictError('该成员已有尚未完成的访谈');

  if (!phone) return;
  if (findByPhone(inviteesOf(plan), normalizePhone(phone))) {
    throw new MemberConflictError(`Member with phone ${maskPhone(phone)} already exists in plan`);
  }
}

/**
 * Load the interview and reject it unless it is removable.
 *
 * Three ways to refuse, each its own error: unknown id, an interview belonging to
 * a different plan (the route pair is inconsistent), and a COMPLETED one (the
 * conversation happened; deleting it would lose recorded answers while the
 * report and its counters stayed behind).
 */
async function assertRemovable(tx: Tx, planId: string, interviewId: string) {
  const interview = await tx.interview.findUnique({ where: { id: interviewId } });
  if (!interview) throw new InterviewNotFoundError(interviewId);
  if (interview.planId !== planId) throw new InvalidStateError('该访谈记录不属于此计划');
  if (interview.status === 'COMPLETED') throw new InvalidStateError('无法删除已完成的访谈');
  return interview;
}

/** True when `status` has already been counted as a send attempt. */
function isCounted(status: SendStatus | undefined): boolean {
  return status === SendStatus.SENT || status === SendStatus.FAILED;
}

/**
 * The plan update for a removal: drop the invitee and un-count the send.
 *
 * The counters are decremented only for the states they were incremented for,
 * because a PENDING member was never counted and decrementing anyway would drift
 * the plan's sent/failed totals below zero over repeated add/remove cycles.
 */
function removalUpdate(
  invitees: InviteeData[],
  interview: { userId: string; sendStatus?: SendStatus | null }
): Prisma.InterviewPlanUpdateInput {
  const update: Prisma.InterviewPlanUpdateInput = {
    inviteeData: invitees.filter(
      (inv) => inv.userId !== interview.userId
    ) as unknown as Prisma.InputJsonValue,
    updatedBy: 'admin',
  };
  const status = interview.sendStatus ?? undefined;
  if (isCounted(status)) update.sentCount = { decrement: 1 };
  if (status === SendStatus.FAILED) update.failedCount = { decrement: 1 };
  return update;
}

/**
 * The invitation text for a 1:1 chat.
 *
 * A plan can supply its own wording; the generic text is the fallback, and it has
 * to tell the invitee what to DO (reply anything to begin), not just that they
 * were invited — an invitation with no next step gets ignored.
 */
function invitationBody(planName: string, invitationPrompt: string): string {
  if (invitationPrompt) return `${invitationPrompt}\n\n> 来自「${planName}」访谈`;
  return `您被邀请参与 **"${planName}"** 访谈。请在聊天中回复任意消息即可开始访谈。`;
}

export class InterviewPlanService extends InterviewPlanSendService {
  private dingTalkClient: DingTalkClient;
  private streamClient?: DingTalkStreamClient | undefined;
  private tokenManager?: TokenManager | undefined;

  constructor(
    prisma: PrismaClient,
    dingTalkClient?: DingTalkClient,
    streamClient?: DingTalkStreamClient,
    tokenManager?: TokenManager
  ) {
    super(prisma);
    this.dingTalkClient = dingTalkClient ?? DingTalkClient.fromEnv();
    this.streamClient = streamClient;
    this.tokenManager = tokenManager;
  }

  // archlint-disable-next-line
  async addMember(planId: string, input: AddMemberInput): Promise<{ interviewId: string }> {
    const { userId, name } = await resolveMemberIdentity(this.dingTalkClient, input);
    const { phone } = input;

    const interviewId = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) throw new PlanNotFoundError(planId);

      await assertNoMemberConflict(tx, planId, userId, phone, plan);

      const interview = await tx.interview.create({
        data: {
          userId,
          templateId: plan.templateId,
          planId,
          status: 'PENDING' as const,
          maxFollowups: DEFAULT_MAX_FOLLOWUPS,
        },
      });

      await tx.interviewPlan.update({
        where: { id: planId },
        data: {
          inviteeData: withInvitee(
            inviteesOf(plan),
            userId,
            name,
            phone
          ) as unknown as Prisma.InputJsonValue,
          updatedBy: 'admin',
        },
      });

      return interview.id;
    });

    info('Member added to plan', { planId, userId, interviewId });
    return { interviewId };
  }

  // archlint-disable-next-line
  async removeMember(planId: string, interviewId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const interview = await assertRemovable(tx, planId, interviewId);
      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) throw new PlanNotFoundError(planId);

      await tx.interview.delete({ where: { id: interviewId } });
      await tx.interviewPlan.update({
        where: { id: planId },
        data: removalUpdate(inviteesOf(plan), interview),
      });

      info('Member removed from plan', {
        planId,
        interviewId,
        userId: interview.userId,
        wasCounted: isCounted(interview.sendStatus ?? undefined),
        wasFailed: interview.sendStatus === SendStatus.FAILED,
      });
    });
  }

  // archlint-disable-next-line
  async sendReminder(
    planId: string,
    interviewId?: string
  ): Promise<{ reminded: number; failed: number }> {
    const plan = await this.prisma.interviewPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new PlanNotFoundError(planId);

    const targets = await this.resolveReminderTargets(planId, interviewId);
    if (targets.length === 0) return { reminded: 0, failed: 0 };

    const useSingleChat = Boolean(this.streamClient && this.tokenManager);
    const tally = await this.dispatchReminders(targets, plan.name, planId, useSingleChat);

    info('Reminders sent', {
      planId,
      ...tally,
      channel: useSingleChat ? 'single-chat' : 'work-notification',
    });
    return tally;
  }

  /**
   * Send the reminders over the chosen channel.
   *
   * Kept separate from `sendReminder` so the channel decision is one boolean and
   * the two branches differ only in which sender runs — not in the surrounding
   * logging and target resolution, which are identical for both.
   */
  private async dispatchReminders(
    targets: Array<{ id: string; userId: string }>,
    planName: string,
    planId: string,
    useSingleChat: boolean
  ): Promise<{ reminded: number; failed: number }> {
    if (useSingleChat) return this.remindViaSingleChat(targets, planName, planId);
    return this.remindViaWorkNotification(targets, planName, planId);
  }

  /**
   * Which interviews a reminder run should notify.
   *
   * With an id, only that interview — rejecting one that belongs to another plan
   * or has already finished. Without one, every unfinished interview in the plan.
   */
  private async resolveReminderTargets(
    planId: string,
    interviewId?: string
  ): Promise<Array<{ id: string; userId: string }>> {
    if (!interviewId) return this.unfinishedTargets(planId);
    return this.singleTarget(planId, interviewId);
  }

  /** Every still-open interview in the plan — the "remind everyone" mode. */
  private async unfinishedTargets(planId: string): Promise<Array<{ id: string; userId: string }>> {
    return this.prisma.interview.findMany({
      where: { planId, status: { notIn: [...TERMINAL_INTERVIEW_STATUSES] } },
      select: { id: true, userId: true },
    });
  }

  /**
   * The one interview to remind, or none when it is already over.
   *
   * An interview in another plan is an error rather than an empty result: the
   * caller named a specific id, so silently skipping it would look like success.
   */
  private async singleTarget(
    planId: string,
    interviewId: string
  ): Promise<Array<{ id: string; userId: string }>> {
    const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview || interview.planId !== planId) throw new InterviewNotFoundError(interviewId);
    if (interview.status === 'COMPLETED' || interview.status === 'CANCELLED') return [];
    return [{ id: interview.id, userId: interview.userId }];
  }

  /**
   * Remind each target in its own 1:1 chat with the bot.
   *
   * Preferred channel when the Stream client and token manager are wired: the
   * reminder lands in the same conversation the interview happens in.
   */
  private async remindViaSingleChat(
    targets: Array<{ id: string; userId: string }>,
    planName: string,
    planId: string
  ): Promise<{ reminded: number; failed: number }> {
    const client = this.streamClient as DingTalkStreamClient;
    const tokenMgr = this.tokenManager as TokenManager;
    const accessToken = await tokenMgr.getAccessToken();
    let reminded = 0;
    let failed = 0;
    for (const target of targets) {
      const result = await client.sendSingleChatMarkdown(
        target.userId,
        '访谈提醒',
        `**访谈提醒**\n\n您参与的访谈 **"${planName}"** 尚未完成，请在本聊天中回复任意消息继续完成访谈。`,
        accessToken
      );
      if (result.success) {
        reminded++;
      } else {
        failed++;
        error('Reminder send failed (single chat)', {
          planId,
          userId: target.userId,
          error: result.error,
        });
      }
    }
    return { reminded, failed };
  }

  /**
   * Remind every target through the work-notification API, in batches.
   *
   * Each batch is settled independently so one failed send neither aborts the
   * batch nor is silently counted as delivered.
   */
  private async remindViaWorkNotification(
    targets: Array<{ id: string; userId: string }>,
    planName: string,
    planId: string
  ): Promise<{ reminded: number; failed: number }> {
    const message = `【访谈提醒】您参与的访谈 "${planName}" 尚未完成，请抽空回复访谈邀约消息继续完成。`;
    const concurrency = 10;
    let reminded = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((target) => messageSender.sendTextMessage([target.userId], message))
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          reminded++;
          continue;
        }
        failed++;
        const errMsg = result.reason instanceof Error ? result.reason.message : 'send failed';
        error('Reminder send failed', {
          planId,
          userId: batch[j].userId,
          error: errMsg,
        });
      }
    }
    return { reminded, failed };
  }

  protected async sendInvitation(
    userId: string,
    planName: string,
    invitationPrompt: string
  ): Promise<void> {
    const client = this.streamClient;
    const tokenMgr = this.tokenManager;
    // Without the Stream client and its token manager there is no 1:1 chat to
    // write into, so the parent's channel is the only option.
    if (!client || !tokenMgr) return super.sendInvitation(userId, planName, invitationPrompt);

    const token = await tokenMgr.getAccessToken();
    const result = await client.sendSingleChatMarkdown(
      userId,
      '访谈邀请',
      invitationBody(planName, invitationPrompt),
      token
    );
    if (!result.success) {
      throw new Error(`DingTalk single chat failed: ${result.error || 'unknown'}`);
    }
  }

  async updatePlan(
    planId: string,
    input: {
      name?: string;
      description?: string;
      targetDate?: string;
      schedule?: string;
    }
  ): Promise<void> {
    return super.updatePlan(planId, input);
  }

  /**
   * Batch member import moved verbatim from the /api/plans/:id/import-commit
   * route (REQ-181): same queries, same order, same error strings. The route
   * maps the thrown typed errors onto HTTP codes.
   */
  // archlint-disable-next-line
  async importMembers(
    planId: string,
    rows: ImportMemberRow[]
  ): Promise<{ imported: number; skipped: number; interviewIds: string[] }> {
    const plan = await this.assertImportable(planId);
    await this.assertNoCrossPlanDuplicates(
      planId,
      rows.map((r) => r.userId)
    );

    const existingUserIdSet = await this.userIdsAlreadyInPlan(
      planId,
      rows.map((r) => r.userId)
    );
    const newRows = rows.filter((r) => !existingUserIdSet.has(r.userId));
    const skipped = rows.length - newRows.length;

    // Every row was already a member: nothing to create, and no audit entry
    // either, because no state changed.
    if (newRows.length === 0) return { imported: 0, skipped, interviewIds: [] };

    const interviewIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const row of newRows) {
        const interview = await tx.interview.create({
          data: {
            userId: row.userId,
            templateId: plan.templateId,
            planId,
            status: 'PENDING',
            maxFollowups: DEFAULT_MAX_FOLLOWUPS,
          },
        });
        ids.push(interview.id);
      }

      const existingInvitees = inviteesOf(plan);
      const newInvitees = newRows.map(inviteeRowOf);
      await tx.interviewPlan.update({
        where: { id: planId },
        data: {
          inviteeData: [...existingInvitees, ...newInvitees] as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'BATCH_IMPORT',
          entityType: 'InterviewPlan',
          entityId: planId,
          details: JSON.stringify({
            imported: newRows.length,
            skipped,
            totalRows: rows.length,
          }),
        },
      });

      return ids;
    });

    return { imported: newRows.length, skipped, interviewIds };
  }

  /**
   * Load the plan and reject it unless members may be imported into it.
   *
   * Import is only meaningful before the plan starts running: once it is
   * in progress or closed, the invitee list and the interview set are expected
   * to match what was already sent out.
   */
  private async assertImportable(planId: string) {
    const plan = await this.prisma.interviewPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new PlanNotFoundError(planId);
    if (plan.status !== 'PENDING' && plan.status !== 'READY') {
      throw new InvalidStateError('计划当前状态不允许导入成员');
    }
    return plan;
  }

  /**
   * Reject the whole import when any user is mid-interview elsewhere.
   *
   * This is all-or-nothing on purpose: a partial import would leave the admin
   * with a half-applied CSV and no record of which rows landed, so the message
   * names every conflicting user and plan instead.
   */
  private async assertNoCrossPlanDuplicates(planId: string, userIds: string[]): Promise<void> {
    const dups = await this.prisma.interview.findMany({
      where: {
        userId: { in: userIds },
        planId: { not: planId },
        status: { notIn: [...TERMINAL_INTERVIEW_STATUSES] },
      },
      select: { userId: true, planId: true },
    });
    if (dups.length === 0) return;
    const conflicts = dups.map((d) => `userId=${d.userId} 在计划 ${d.planId} 中有未完成的访谈`);
    throw new MemberConflictError(`以下成员已有尚未完成的访谈：${conflicts.join('；')}`);
  }

  /** The subset of `userIds` that is already a member of this plan. */
  private async userIdsAlreadyInPlan(planId: string, userIds: string[]): Promise<Set<string>> {
    const existing = await this.prisma.interview.findMany({
      where: { planId, userId: { in: userIds } },
      select: { userId: true },
    });
    return new Set(existing.map((e) => e.userId));
  }
}

export interface ImportMemberRow {
  userId: string;
  inputName?: string;
  dingtalkName?: string;
}

/** The invitee record for an imported row, preferring DingTalk's own name. */
function inviteeRowOf(row: ImportMemberRow): InviteeData {
  return { userId: row.userId, name: row.dingtalkName || row.inputName || '' };
}
