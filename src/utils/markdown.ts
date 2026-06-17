import { Marked, type Token } from 'marked';
import { error } from './logger.js';

const marked = new Marked({
  gfm: true,
  breaks: false,
});

// Strip raw HTML tokens to prevent XSS from attacker-influenced LLM output.
// marked@14 has no built-in sanitizer; we convert `html` block/inline tokens
// to escaped text so they render visibly but never execute.
marked.use({
  walkTokens(token: Token) {
    if (token.type === 'html') {
      token.type = 'text' as 'html';
      token.text = escapeHtml(token.text ?? '');
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
