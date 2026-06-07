import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/utils/markdown.js';

describe('Utility Classes', () => {
  it('should render markdown to HTML', () => {
    const result = renderMarkdown('# Hello');
    expect(result).toContain('<h1');
    expect(result).toContain('Hello');
  });

  it('should return empty string for null input', () => {
    expect(renderMarkdown(null)).toBe('');
  });
});
