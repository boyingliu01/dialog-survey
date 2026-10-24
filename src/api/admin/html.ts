// @no-test-required: covered by tests/admin-error-branches.test.ts
/**
 * HTML fragment helpers shared by every admin route module.
 *
 * Admin routes return HTMX fragments, so error reporting is markup, not JSON:
 * these two functions are the single escaping boundary for user-visible error
 * text. They are imported by nearly every admin module, which is why they live
 * in their own leaf file instead of a catch-all "helpers" module.
 */

/** Escape the five characters that would otherwise close out of an HTML text node. */
export function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** The red error banner an admin fragment shows in place of its normal content. */
export function htmlError(message: string): string {
  return `<div class="text-red-600">${htmlEscape(message)}</div>`;
}
