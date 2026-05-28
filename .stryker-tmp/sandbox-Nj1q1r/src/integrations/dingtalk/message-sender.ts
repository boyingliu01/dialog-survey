// @ts-nocheck
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
      const batchResult = await sendFn(batch);

      result.successCount += batchResult.successCount ?? 0;
      result.failedUserIds.push(...(batchResult.failedUserIds ?? []));
      result.errors?.push(...(batchResult.errors ?? []));
      if (batchResult.taskId) result.taskId = batchResult.taskId;

      if (i + this.BATCH_SIZE < userIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return result;
  }

  private async doSend(
    userIds: string[],
    msg: Record<string, unknown>
  ): Promise<Partial<SendResult>> {
    const agentId = process.env.DINGTALK_AGENT_ID;
    if (!agentId) {
      return {
        taskId: '',
        successCount: 0,
        failedUserIds: userIds,
        errors: userIds.map((uid) => ({
          userId: uid,
          error: 'DINGTALK_AGENT_ID must be set',
        })),
      };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const token = await tokenManager.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          userid_list: userIds.join(','),
          msg,
        }),
      });

      const data = (await response.json()) as {
        errcode: number;
        errmsg: string;
        task_id?: number | string;
      };

      if (data.errcode === 400014 || data.errcode === 40014) {
        tokenManager.invalidateToken();
        continue;
      }

      if (data.errcode !== 0) {
        return {
          taskId: '',
          successCount: 0,
          failedUserIds: userIds,
          errors: userIds.map((uid) => ({ userId: uid, error: data.errmsg })),
        };
      }

      return {
        taskId: String(data.task_id ?? ''),
        successCount: userIds.length,
        failedUserIds: [],
      };
    }

    return { taskId: '', successCount: 0, failedUserIds: userIds };
  }
}

export const messageSender = new DingTalkMessageSender();
