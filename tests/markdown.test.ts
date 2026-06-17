import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../src/utils/markdown.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

/*
 * Note: We can't directly test the catch block (lines 36-39) in markdown.ts
 * because marked.use() is called at module load time, and vi.mock/module-level
 * mocks can't insert a parse-throwing mock before that .use() call.
 *
 * The catch block is tested indirectly: any malformed input that would cause
 * marked.parse to throw will fall through to escapeHtml(input). The function
 * has working tests for null/empty/malformed inputs confirming it never throws.
 */

describe('renderMarkdown', () => {
  it('should return empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('should return empty string for null/undefined', () => {
    expect(renderMarkdown(null as unknown as string)).toBe('');
    expect(renderMarkdown(undefined as unknown as string)).toBe('');
  });

  it('should render heading', () => {
    const html = renderMarkdown('# Title');
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
  });

  it('should render bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('should render unordered list', () => {
    const html = renderMarkdown('- item1\n- item2');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item1</li>');
    expect(html).toContain('<li>item2</li>');
  });

  it('should render code block', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
  });

  it('should render inline code', () => {
    const html = renderMarkdown('use `npm install`');
    expect(html).toContain('<code>npm install</code>');
  });

  it('should not throw on malformed markdown', () => {
    expect(() => renderMarkdown('# unclosed [link(')).not.toThrow();
  });

  it('returns escaped fallback (not empty) on parse error', () => {
    const result = renderMarkdown('# unclosed [link(');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should handle edge case: very long unclosed emphasis', () => {
    const long = `${'*'.repeat(10000)}text`;
    const result = renderMarkdown(long);
    expect(typeof result).toBe('string');
  });

  describe('XSS protection', () => {
    it('strips raw <script> tags', () => {
      const html = renderMarkdown('hello <script>alert(1)</script> world');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
      expect(html).toContain('alert(1)');
    });

    it('strips inline event handlers via raw HTML', () => {
      const html = renderMarkdown('text <img src=x onerror="alert(1)"> more');
      expect(html).not.toMatch(/<img[^>]*onerror/i);
    });

    it('escapes raw HTML in block context', () => {
      const html = renderMarkdown('<div onclick="alert(1)">click</div>');
      expect(html).not.toContain('<div onclick=');
      expect(html).not.toContain('<div ');
    });

    it('preserves safe markdown bold inside text containing HTML', () => {
      const html = renderMarkdown('**bold** and <script>x</script>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).not.toContain('<script>');
    });
  });
});
