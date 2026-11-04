import { Marked, type Token } from 'marked';
import { error } from './logger.js';

const marked = new Marked({
  gfm: true,
  breaks: true, // Convert single newlines to <br>
});

// Strip dangerous HTML tokens (script, iframe, etc.) but allow a bare <br>/<hr>.
// marked@14 has no built-in sanitizer; we selectively escape dangerous HTML.
// The allowlist is `SAFE_VOID_TAG` below — it matches the WHOLE tag, because
// matching only the name passed `<br onload="...">` straight through.

/**
 * True when a raw HTML token is exactly a safe void tag: `<br>`, `<br/>`,
 * `<br />`, `<hr>`, `<hr/>`, `<hr />`, or the closing `</br>`/`</hr>` forms.
 *
 * Matching only the NAME is not enough. `<br onload="alert(1)">` has the name
 * `br`, so a name-only allowlist PASSES it through as raw HTML — an
 * event-handler injection behind a tag the allowlist was supposed to vouch
 * for. That was a real hole here: an earlier `tagNameOf()` helper extracted
 * `br` from `<br onload="...">` and let it through. Matching the whole token
 * instead makes any attribute fail closed (escaped).
 *
 * A note on how the previous version died silently: it sliced from the first of
 * `/`, whitespace or `>` onwards, which leaves `<br` for the input `<br>`, so
 * `^(br|hr)$` could never match and EVERY html token was escaped — `<br>`
 * included. The comment above described behaviour that did not happen. The
 * tests missed it because `breaks: true` renders a plain newline as `<br>`
 * anyway, so `toContain('<br>')` passed without the allowlist ever running;
 * the regression test now asserts the ABSENCE of `&lt;br`.
 */
const SAFE_VOID_TAG = /^<\/?(?:br|hr)\s*\/?>$/i;

function isSafeHtml(raw: string): boolean {
  return SAFE_VOID_TAG.test(raw.trim());
}

marked.use({
  walkTokens(token: Token) {
    if (token.type === 'html') {
      const text = token.text ?? '';
      // Allow only a bare <br>/<hr>; escape EVERYTHING else, attributes included.
      if (!isSafeHtml(text)) {
        token.type = 'text' as 'html';
        token.text = escapeHtml(text);
      }
    }
  },
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(input: string | null | undefined): string {
  if (!input) return '';
  try {
    return marked.parse(input, { async: false }) as string;
  } catch (e) {
    // unreachable — marked.js ~never throws on any input
    /* c8 ignore start */
    const errMsg = e instanceof Error ? e.message : 'Markdown parse failed';
    error('renderMarkdown failed', { error: errMsg });
    return escapeHtml(input);
    /* c8 ignore stop */
  }
}
