import { marked } from 'marked';

// Configure marked once at module load - GitHub-flavored markdown, no async
marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Render Markdown text to HTML.
 * Returns an empty string for empty/null/undefined input.
 * Falls back to empty string on parse errors (does not throw).
 */
export function renderMarkdown(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '';
  }
  try {
    // marked.parse returns string when async option is false (default)
    return marked.parse(input, { async: false }) as string;
  } catch {
    return '';
  }
}
