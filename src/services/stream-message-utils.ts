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

/** One segment of a DingTalk richText payload; pictures/voice carry no `text`. */
interface RichTextSegment {
  text?: unknown;
  richText?: unknown;
  content?: unknown;
}

/** Subset of the DingTalk bot message payload that the interview bot reads. */
export interface DingTalkMessagePayload {
  senderStaffId?: unknown;
  sessionWebhook?: unknown;
  text?: { content?: unknown } | null;
  content?: unknown;
  markdown?: { text?: unknown } | null;
}

/**
 * Flattens DingTalk rich-text segments into plain text.
 *
 * A richText message carries `content: { richText: [...] }` and each segment is
 * either a plain string or an object with a `text` field. Picture/voice
 * segments carry no `text` and are dropped rather than stringified.
 */
function richTextToPlain(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(richTextToPlain).join('');
  if (typeof value !== 'object' || value === null) return '';

  const segment = value as RichTextSegment;
  if (typeof segment.text === 'string') return segment.text;
  if (Array.isArray(segment.richText)) return richTextToPlain(segment.richText);
  if (Array.isArray(segment.content)) return richTextToPlain(segment.content);
  if (typeof segment.content === 'string') return segment.content;
  return '';
}

/**
 * Extracts the user's plain-text answer from a DingTalk bot message payload.
 *
 * Handles `text` (plain), `content.richText` (pasted/formatted text) and
 * `markdown`. Returns '' for messages with no readable text (image, voice,
 * file), which the caller treats as "no answer" instead of advancing the
 * interview with garbage such as "[object Object]".
 */
export function extractMessageContent(data: DingTalkMessagePayload): string {
  const textContent =
    typeof data.text === 'object' && data.text !== null ? data.text.content : undefined;
  if (typeof textContent === 'string') return textContent;

  const richText = richTextToPlain(textContent).trim();
  if (richText) return richText;

  if (typeof data.content === 'string') return data.content;
  const contentText = richTextToPlain(data.content).trim();
  if (contentText) return contentText;

  const markdownText =
    typeof data.markdown === 'object' && data.markdown !== null ? data.markdown.text : undefined;
  if (typeof markdownText === 'string') return markdownText;

  return '';
}

export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  try {
    const data = JSON.parse(message.data) as DingTalkMessagePayload;
    const content = extractMessageContent(data);

    return {
      userId: typeof data.senderStaffId === 'string' ? data.senderStaffId : '',
      content: content,
      sessionWebhook: typeof data.sessionWebhook === 'string' ? data.sessionWebhook : '',
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
