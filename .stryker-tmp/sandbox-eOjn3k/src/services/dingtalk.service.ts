// @ts-nocheck
import { error, info } from '../utils/logger.js';

const WEBHOOK_URL = process.env.DINGTALK_WEBHOOK_URL;

interface SendMessageResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function sendText(userId: string, content: string): Promise<SendMessageResult> {
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('xxx')) {
    return { success: false, error: 'Webhook not configured' };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: `[Interview Bot]\n${content}` },
        at: { atUserIds: [userId] },
      }),
    });

    if (!response.ok) {
      const errMsg = `Failed to send message: ${response.status}`;
      error(errMsg);
      return { success: false, error: errMsg };
    }

    info('Text message sent', { userId });
    return { success: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    error('Failed to send DingTalk message', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

export async function sendRichText(
  userId: string,
  title: string,
  text: string,
  buttons?: { title: string; actionURL: string }[]
): Promise<SendMessageResult> {
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('xxx')) {
    return { success: false, error: 'Webhook not configured' };
  }

  const markdown = {
    title,
    text: `### ${title}\n\n${text}`,
  };

  const actionCard = buttons?.length
    ? {
        title,
        text: `### ${title}\n\n${text}`,
        btnOrientation: '0',
        btns: buttons.map((btn) => ({
          title: btn.title,
          actionURL: btn.actionURL,
        })),
      }
    : undefined;

  try {
    const body = actionCard
      ? { msgtype: 'actionCard', actionCard }
      : { msgtype: 'markdown', markdown };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errMsg = `Failed to send rich message: ${response.status}`;
      error(errMsg);
      return { success: false, error: errMsg };
    }

    info('Rich text message sent', { userId, hasButtons: !!buttons });
    return { success: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    error('Failed to send rich message', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

export function isWebhookConfigured(): boolean {
  return !!WEBHOOK_URL && !WEBHOOK_URL.includes('xxx');
}
