// @no-test-required: covered by tests/admin-templates-extra.test.ts and tests/admin-plan-matcher.test.ts
/**
 * View-model builders for the admin pages.
 *
 * These turn repository/service rows into exactly the local variables the
 * Nunjucks templates expect. They are kept here — not inline in the handlers —
 * so the same projection (invitee name lookup, date formatting, template content
 * parsing) is written once and can be asserted without an HTTP round trip.
 */

/** Localised date for the admin tables; `-` when the column is empty. */
export function fmtDate(d: Date | null | undefined): string {
  return d?.toLocaleString('zh-CN') ?? '-';
}

/**
 * Map `userId` → display name from a plan's raw `inviteeData` JSON column.
 *
 * Entries that are not objects, or that lack either field, are skipped: a plan's
 * invitee payload is user-editable data and has historically contained both.
 */
export function buildInviteeNameMap(inviteeData: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(inviteeData)) return map;
  for (const entry of inviteeData) {
    const pair = inviteeNamePair(entry);
    if (pair) map[pair[0]] = pair[1];
  }
  return map;
}

/**
 * The `[userId, name]` pair an invitee entry provides, or null.
 *
 * Both fields must be non-empty STRINGS. This map is used to replace a raw id
 * with a human name in the admin tree, so a half-populated entry is worse than no
 * entry: an empty name would render a blank label where the id at least identifies
 * the row.
 */
function inviteeNamePair(entry: unknown): [string, string] | null {
  const obj = asRecord(entry);
  if (!obj) return null;
  const userId = nonEmptyString(obj['userId']);
  const name = nonEmptyString(obj['name']);
  if (userId === undefined || name === undefined) return null;
  return [userId, name];
}

/**
 * The value as an object, or null when it is not object-like.
 *
 * Arrays are NOT excluded, matching `export.service.ts#isRecord`: `inviteeData`
 * is untyped JSON that has historically been hand-edited, and an array carrying
 * `userId`/`name` properties is still a usable entry. Rejecting it here would be a
 * behaviour change nothing asked for.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/** The value when it is a non-empty string, else undefined. */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Pull name/phone out of one invitee entry, if it is shaped like an object. */
function pickInviteeFields(entry: unknown): { name?: string; phone?: string } | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const result: { name?: string; phone?: string } = {};
  if (typeof obj['name'] === 'string') result.name = obj['name'];
  if (typeof obj['phone'] === 'string') result.phone = obj['phone'];
  return result;
}

/** The invitee entry matching `userId`, or `{}` when the plan has none. */
export function findInviteeInfo(
  inviteeData: unknown,
  userId: string
): { name?: string; phone?: string } {
  if (!Array.isArray(inviteeData)) return {};
  for (const entry of inviteeData) {
    const fields = pickInviteeFields(entry);
    if (!fields) continue;
    if ((entry as Record<string, unknown>)['userId'] === userId) return fields;
  }
  return {};
}

/**
 * Build the leaf label for an interview in the admin tree (issue #223).
 *
 * A bare `userId` is unreadable for an administrator looking at a list of
 * numeric DingTalk ids, so the tree shows the invitee's name and phone from the
 * plan's imported `inviteeData` when they are known:
 *
 * - name + phone  → `姓名-电话-UserID`
 * - name only     → `姓名-UserID`
 * - neither       → `UserID` (unchanged behaviour)
 *
 * Empty or whitespace-only fields count as absent: the import path stores `''`
 * for a blank CSV cell, and rendering `" -1234"` would be worse than the id.
 */
export function interviewTreeLabel(
  info: { name?: string; phone?: string },
  userId: string
): string {
  const name = typeof info.name === 'string' ? info.name.trim() : '';
  const phone = typeof info.phone === 'string' ? info.phone.trim() : '';
  const parts = name ? (phone ? [name, phone, userId] : [name, userId]) : [userId];
  return parts.join('-');
}

/**
 * Parse a template's stored `content` JSON string.
 *
 * A malformed column degrades to `{}` so the page renders with an empty editor
 * instead of failing the whole request; `questions` is defaulted to an array
 * because every template form iterates it.
 */
export function parseTemplateContent(raw: string): {
  content: Record<string, unknown>;
  questions: string[];
} {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { content: parsed, questions: (parsed['questions'] as string[]) || [] };
}
