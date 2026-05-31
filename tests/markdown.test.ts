import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/utils/markdown.js';

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
});
