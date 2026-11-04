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
  errors?: { userId: string; error: string }[];
}

/**
 * Send one batch, refreshing the token when DingTalk says it expired.
 *
 * Returns the partial result rather than throwing so the batch loop can keep
 * going: one failed batch must not abort the remaining users. When every attempt
 * is a token refresh the credential never became usable, and that is reported as
 * a whole-batch failure.
 */
async function sendAsyncWithRetry(
  agentId: string,
  userIds: string[],
  msg: Record<string, unknown>
): Promise<Partial<SendResult>> {
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    const token = await tokenManager.getAccessToken();
    const data = await postAsyncSend(agentId, userIds, msg, token);

    // An expired token answers with its own errcode instead of a 401. Invalidate
    // it and retry: the batch itself was fine, only the credential was stale.
    if (isTokenExpired(data.errcode)) {
      tokenManager.invalidateToken();
      continue;
    }
    if (data.errcode !== 0) return allFailed(userIds, data.errmsg);

    return { taskId: String(data.task_id ?? ''), successCount: userIds.length, failedUserIds: [] };
  }
  return { taskId: '', successCount: 0, failedUserIds: userIds };
}

/** Attempts allowed when the token keeps coming back expired. */
const MAX_SEND_ATTEMPTS = 3;

/**
 * Errcodes DingTalk uses for an expired or invalid access token.
 *
 * 400014 is the documented asyncsend value and 40014 the variant seen in the
 * wild; both mean the same thing, so they are retried identically.
 */
const TOKEN_EXPIRED_ERRCODES = new Set([400014, 40014]);

/** True when `errcode` means the token must be refreshed before retrying. */
function isTokenExpired(errcode: number): boolean {
  return TOKEN_EXPIRED_ERRCODES.has(errcode);
}

/** The asyncsend response body. */
interface AsyncSendResponse {
  errcode: number;
  errmsg: string;
  task_id?: number | string;
}

/** POST one batch to the asyncsend endpoint. */
async function postAsyncSend(
  agentId: string,
  userIds: string[],
  msg: Record<string, unknown>,
  token: string
): Promise<AsyncSendResponse> {
  const url = `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, userid_list: userIds.join(','), msg }),
  });
  return (await response.json()) as AsyncSendResponse;
}

/**
 * Fold one batch's outcome into the running total.
 *
 * The task id is kept from the LAST batch that reported one: each batch is a
 * separate asyncsend call, so they carry different ids, and a caller that wants
 * "the" task id wants the most recent one it can still poll.
 */
function mergeBatch(total: SendResult, batch: Partial<SendResult>): void {
  total.successCount += batch.successCount ?? 0;
  total.failedUserIds.push(...(batch.failedUserIds ?? []));
  total.errors?.push(...(batch.errors ?? []));
  if (batch.taskId) total.taskId = batch.taskId;
}

/**
 * Wait between batches.
 *
 * DingTalk rate-limits the message endpoint, and a 100-user batch fired back to
 * back is what trips it -- the pause is the rate limit, not an optimisation.
 */
async function pauseBetweenBatches(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * A result in which every user in `userIds` failed with `error`.
 *
 * The batch API reports per-user errors, so a whole-batch failure still has to
 * name each user -- a caller reconciling send status must not have to distinguish
 * "nobody was told" from "these users specifically were not told".
 */
function allFailed(userIds: string[], error: string): SendResult {
  return {
    taskId: '',
    successCount: 0,
    failedUserIds: userIds,
    errors: userIds.map((uid) => ({ userId: uid, error })),
  };
}

export class DingTalkMessageSender {
  private readonly BATCH_SIZE = 100;

  async sendTextMessage(userIds: string[], content: string): Promise<SendResult> {
    return this.sendInBatches(userIds, (batch) =>
      this.doSend(batch, { msgtype: 'text', text: { content } })
    );
  }

  async sendActionCard(userIds: string[], card: ActionCardContent): Promise<SendResult> {
    return this.sendInBatches(userIds, (batch) =>
      this.doSend(batch, { msgtype: 'actionCard', actionCard: card })
    );
  }

  private async sendInBatches(
    userIds: string[],
    sendFn: (batch: string[]) => Promise<Partial<SendResult>>
  ): Promise<SendResult> {
    const result: SendResult = {
      taskId: '',
      successCount: 0,
      failedUserIds: [],
      errors: [],
    };

    for (let i = 0; i < userIds.length; i += this.BATCH_SIZE) {
      const batch = userIds.slice(i, i + this.BATCH_SIZE);
      mergeBatch(result, await sendFn(batch));
      if (i + this.BATCH_SIZE < userIds.length) await pauseBetweenBatches();
    }

    return result;
  }

  private async doSend(
    userIds: string[],
    msg: Record<string, unknown>
  ): Promise<Partial<SendResult>> {
    const agentId = process.env['DINGTALK_AGENT_ID'];
    if (!agentId) return allFailed(userIds, 'DINGTALK_AGENT_ID must be set');
    return sendAsyncWithRetry(agentId, userIds, msg);
  }
}

export const messageSender = new DingTalkMessageSender();
