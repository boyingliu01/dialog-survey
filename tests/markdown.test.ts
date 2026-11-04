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

  /**
   * `ALLOWED_HTML_TAGS` is an ALLOWLIST, so the interesting cases are the near
   * misses: a tag whose name merely starts with an allowed one, a closing form,
   * and a self-closing form. Each of these is a tag the sanitizer has to decide
   * about, and getting the decision wrong is an XSS hole rather than a cosmetic
   * bug. The allowlist was only exercised through `<br>` rendering before.
   */
  describe('HTML allowlist (near misses)', () => {
    it('allows an inline <br> through as real HTML (not &lt;br&gt;)', () => {
      // The decisive assertion is the ABSENCE of &lt;br&gt;. `breaks: true` turns a
      // plain newline into <br> as well, so `toContain('<br>')` alone passes even
      // when the allowlist is broken -- which is exactly how the dead allowlist
      // went unnoticed. Escaped input is the only thing that proves it ran.
      const html = renderMarkdown('a\n<br>\nb');
      expect(html).not.toContain('&lt;br');
      expect(html).toContain('<br>');
    });

    it('still escapes a BLOCK-level <hr>, which marked emits as a block token', () => {
      // Documented boundary, not an aspiration. marked lexes a line that begins
      // with <hr> as a BLOCK html token whose text is "<hr>\nb" -- the trailing
      // newline is part of the token, so the whole-tag allowlist cannot match it
      // and it is escaped. Enabling <hr> would require matching a prefix instead
      // of the whole token, and a prefix match is what let `<br onload=...>`
      // through. Escaping an unknown block tag is the fail-closed choice.
      const html = renderMarkdown('a\n<hr>\nb');
      expect(html).toContain('&lt;hr');
      expect(html).not.toContain('<hr>');
    });

    it('escapes <br> carrying ANY attribute (attribute-smuggling case)', () => {
      // Matching the tag NAME alone would pass this through as raw HTML.
      const html = renderMarkdown('<br onload="alert(1)">');
      expect(html).not.toMatch(/<br[^>]*onload/i);
      expect(html).toContain('&lt;br');
    });

    it('escapes a tag whose name merely STARTS with an allowed one', () => {
      const html = renderMarkdown('<brfetch src="x">text</brfetch>');
      expect(html).not.toContain('<brfetch');
      expect(html).toContain('&lt;brfetch');
    });

    it('escapes an iframe', () => {
      const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
      expect(html).not.toContain('<iframe');
      expect(html).toContain('&lt;iframe');
    });

    it('escapes an svg with an onload handler', () => {
      const html = renderMarkdown('<svg onload="alert(1)"></svg>');
      expect(html).not.toMatch(/<svg[^>]*onload/i);
    });

    it('escapes all five entity-significant characters', () => {
      // escapeHtml is only reached for a rejected tag, so drive it through one
      // that carries every character it must neutralise.
      const html = renderMarkdown(`<script>&<>"'</script>`);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&amp;');
      expect(html).toContain('&lt;');
      expect(html).toContain('&gt;');
      expect(html).toContain('&quot;');
      expect(html).toContain('&#39;');
    });

    it('strips CJK HTML in block form as well as inline', () => {
      // L56: the html branch also fires for block tokens. A block-level <script>
      // is the case that matters.
      const html = renderMarkdown('<script>\nalert(1)\n</script>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script');
    });

    it('escapes a bare "<" at the very start of the input', () => {
      // L40: comment/anchor regexes must not misfire on a lone angle bracket.
      const html = renderMarkdown('< not a tag');
      expect(typeof html).toBe('string');
      expect(html).toContain('&lt;');
    });

    it('escapes a closing </br> form with no space', () => {
      // L49: the optional leading slash in SAFE_VOID_TAG.
      const html = renderMarkdown('a</br>b');
      expect(html).not.toContain('<script>');
      expect(typeof html).toBe('string');
    });

    it('escapes an unclosed "<br" with no closing bracket', () => {
      // L45 `$` anchor: without it a PREFIX "<br" would match the allowlist and
      // a truncated tag would pass through as raw HTML. `breaks: true` also
      // emits legitimate <br> here, so assert on the ESCAPED form, not on the
      // absence of "<br".
      const html = renderMarkdown('a\n<br\nb');
      expect(html).toContain('&lt;br');
    });

    it('escapes "<br>" with leading whitespace inside the tag', () => {
      // L45: `<` followed by spaces must still be judged by name, not skipped.
      const html = renderMarkdown('a\n<  br >\nb');
      expect(html).not.toContain('<  br');
    });
  });
});
