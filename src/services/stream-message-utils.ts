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

/**
 * One segment inside a DingTalk `richText` payload. Text segments carry `text`;
 * picture/voice/file segments carry their own keys and no text at all.
 */
interface RichTextSegment {
  text?: unknown;
  [key: string]: unknown;
}

/**
 * Read `container[key]` when `container` is an object, `undefined` otherwise.
 *
 * DingTalk's payload is untyped JSON: every level may be missing, a string, or
 * an object depending on the message type, so each field read needs this guard.
 */
function readField(container: unknown, key: string): unknown {
  if (!container || typeof container !== 'object') return undefined;
  return (container as Record<string, unknown>)[key];
}

/** The string at `container[key]`, or `undefined` when it is absent or not a string. */
function readStringField(container: unknown, key: string): string | undefined {
  const field = readField(container, key);
  return typeof field === 'string' ? field : undefined;
}

/**
 * Join the text segments of a `richText` array, dropping every non-text segment.
 *
 * DingTalk sends a pasted/formatting-carrying reply as
 * `{ msgtype: 'richText', content: { richText: [{ text: '...' }, { downloadCode: '...' }] } }`.
 * Only the `text` members are the user's words; picture/voice/file segments are
 * media descriptors whose string form is meaningless to the interview graph.
 */
function extractRichText(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  const parts: string[] = [];
  for (const segment of segments as RichTextSegment[]) {
    const text = typeof segment === 'string' ? segment : readStringField(segment, 'text');
    if (text) parts.push(text);
  }
  return parts.join('');
}

/**
 * Extract the plain text of a DingTalk message body WITHOUT ever stringifying an
 * object. `String({...})` yields `"[object Object]"`, which is a truthy,
 * non-empty string: it slipped past the empty-content guards downstream and was
 * persisted as a real answer (issue #221), silently discarding the user's reply.
 *
 * Precedence follows the message type: plain text, then a raw string body, then
 * the text segments of a rich-text body, then markdown. Returns `''` for any
 * shape that carries no text, so the caller treats it as "no usable content"
 * instead of writing garbage.
 */
function extractMessageText(data: Record<string, unknown>): string {
  const text = readStringField(data['text'], 'content');
  if (text !== undefined) return text;

  const content = data['content'];
  if (typeof content === 'string') return content;

  const richText = extractRichText(readField(content, 'richText'));
  if (richText) return richText;

  return readStringField(data['markdown'], 'text') ?? '';
}

export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  try {
    const data = JSON.parse(message.data);

    // DingTalk may send non-text messages (rich text, images, voice, files).
    // Extract text by message type; never fall back to String(object).
    const content = extractMessageText(data);

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
