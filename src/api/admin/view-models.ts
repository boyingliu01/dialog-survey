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
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const userId = typeof obj['userId'] === 'string' ? obj['userId'] : undefined;
      const name = typeof obj['name'] === 'string' ? obj['name'] : undefined;
      if (userId && name) {
        map[userId] = name;
      }
    }
  }
  return map;
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
