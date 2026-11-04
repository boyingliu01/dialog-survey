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
 * Keys a rich-text segment may nest its content under, in precedence order.
 *
 * `text` is the common case; `richText` and `content` appear when DingTalk wraps
 * a quoted or pasted block one level deeper.
 */
const SEGMENT_CONTENT_KEYS = ['text', 'richText', 'content'] as const;

/** True when `value` is a non-null object (arrays included; they are handled separately). */
function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Read one segment's text out of `keys` in order.
 *
 * The FIRST key that is a string or an array wins outright, even when it
 * flattens to nothing: that is the key the client chose to put content in, and
 * an empty result there is the answer. Only a key of another type falls through
 * to the next one.
 */
function segmentText(segment: Record<string, unknown>): string {
  for (const key of SEGMENT_CONTENT_KEYS) {
    const nested = segment[key];
    if (typeof nested === 'string') return nested;
    if (Array.isArray(nested)) return flattenRichText(nested);
  }
  return '';
}

/**
 * Flatten DingTalk rich-text segments into plain text.
 *
 * A segment is either a plain string or an object, and the text lives under one
 * of three keys depending on how the client encoded it. Recursing covers nested
 * blocks without a special case.
 *
 * Picture/voice/file segments carry none of those keys and contribute nothing —
 * they are media descriptors, not the user's words.
 */
function flattenRichText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenRichText).join('');
  if (!isContainer(value)) return '';
  return segmentText(value);
}

/**
 * Where a message body may carry its text, in precedence order.
 *
 * A row reads one candidate and returns it, or undefined when that shape is
 * absent. The array is the precedence, so the order is visible in one place
 * instead of being implied by a chain of early returns.
 */
const TEXT_SOURCES: ReadonlyArray<(data: Record<string, unknown>) => string | undefined> = [
  // Plain text: `text.content`.
  (data) => readStringField(data['text'], 'content'),
  // Rich text under `text` when the client did not use `text.content`.
  (data) => nonBlank(flattenRichText(readField(data['text'], 'content'))),
  // A raw string body.
  (data) => stringOrUndefined(data['content']),
  // The rich-text segments of a `content` body.
  (data) => nonBlank(flattenRichText(data['content'])),
  // Markdown.
  (data) => readStringField(data['markdown'], 'text'),
];

/** The trimmed text, or undefined when it is blank. */
function nonBlank(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed ? trimmed : undefined;
}

/** `value` when it is a string, undefined otherwise. */
function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract the plain text of a DingTalk message body WITHOUT ever stringifying an
 * object. `String({...})` yields `"[object Object]"`, which is a truthy,
 * non-empty string: it slipped past the empty-content guards downstream and was
 * persisted as a real answer (issue #221), silently discarding the user's reply.
 *
 * Precedence follows the message type: plain text, then the text segments of a
 * rich-text body, then a raw string body, then markdown. Returns `''` for any
 * shape that carries no text, so the caller treats it as "no usable content"
 * instead of writing garbage.
 *
 * Note the plain-text rows return their value even when blank: an explicit
 * `text.content` of `""` is a decision the client made, and letting a later row
 * win there would substitute unrelated fields for it.
 */
function extractMessageText(data: Record<string, unknown>): string {
  for (const source of TEXT_SOURCES) {
    const text = source(data);
    if (text !== undefined) return text;
  }
  return '';
}

export function parseStreamMessage(message: StreamMessage): ParsedStreamMessage | null {
  try {
    const data = JSON.parse(message.data);

    // DingTalk may send non-text messages (rich text, images, voice, files).
    // Extract text by message type; never fall back to String(object).
    const content = extractMessageText(data);

    // Narrow the identity fields for the same reason as `content`: a
    // non-string here would reach the repository and the webhook allowlist as
    // `[object Object]` rather than failing visibly.
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
