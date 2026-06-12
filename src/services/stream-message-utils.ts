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

export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  try {
    const data = JSON.parse(message.data);
    const content = data.text?.content || data.content || '';

    return {
      userId: data.senderStaffId || '',
      content: content,
      sessionWebhook: data.sessionWebhook || '',
      messageId: message.headers.messageId,
    };
  } catch (e) {
    error('Failed to parse stream message', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Allowed DingTalk hostnames for SSRF protection */
export const ALLOWED_WEBHOOK_HOSTS = new Set([
  'oapi.dingtalk.com',
  'api.dingtalk.com',
  'router.dingtalk.com',
]);

/**
 * Validates that a webhook URL is from an allowed DingTalk hostname.
 * Protects against SSRF attacks via malicious URLs (e.g., file:///, http://169.254169.254/, etc.)
 */
export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function sendReply(sessionWebhook: string, content: string): Promise<boolean> {
  if (!sessionWebhook) {
    error('No sessionWebhook provided');
    return false;
  }

  info('Sending reply (exported)', {
    webhook: sessionWebhook,
    contentLength: content.length,
  });

  try {
    const body = {
      msgtype: 'text',
      text: { content },
    };

    const response = await fetch(sessionWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text();
      error('Failed to send reply', {
        status: response.status,
        statusText: response.statusText,
        webhook: sessionWebhook,
        responseText: responseText.substring(0, 200),
      });
      return false;
    }

    info('Reply sent', {
      webhook: sessionWebhook,
      contentLength: content.length,
    });
    return true;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    error('Failed to send reply', { error: errMsg });
    return false;
  }
}
