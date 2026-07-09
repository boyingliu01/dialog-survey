import { Marked, type Token } from 'marked';
import { error } from './logger.js';

const marked = new Marked({
  gfm: true,
  breaks: true, // Convert single newlines to <br>
});

// Strip dangerous HTML tokens (script, iframe, etc.) but allow safe tags like <br>.
// marked@14 has no built-in sanitizer; we selectively escape dangerous HTML.
const ALLOWED_HTML_TAGS = /^(br|hr)$/i;

marked.use({
  walkTokens(token: Token) {
    if (token.type === 'html') {
      const text = token.text ?? '';
      // Allow safe tags like <br>, <hr>; escape everything else
      if (!ALLOWED_HTML_TAGS.test(text.trim().replace(/[\/\s>].*$/, ''))) {
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
  if (input === null || input === undefined || input === '') {
    return '';
  }
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
