import { describe, expect, it } from 'vitest';
import { buildQuestionMap } from '../src/utils/template-content.js';

describe('buildQuestionMap', () => {
  it('maps questions to q0..qN in order', () => {
    const content = JSON.stringify({ questions: ['第一问', '第二问', '第三问'] });

    expect(buildQuestionMap(content)).toEqual({
      q0: '第一问',
      q1: '第二问',
      q2: '第三问',
    });
  });

  it('returns an empty map for null, undefined and empty content', () => {
    expect(buildQuestionMap(null)).toEqual({});
    expect(buildQuestionMap(undefined)).toEqual({});
    expect(buildQuestionMap('')).toEqual({});
  });

  it('returns an empty map when the JSON is unparsable', () => {
    // A malformed template must degrade to raw ids, never fail the request.
    expect(buildQuestionMap('{not json')).toEqual({});
  });

  it('returns an empty map when questions is absent', () => {
    expect(buildQuestionMap(JSON.stringify({ title: 'no questions' }))).toEqual({});
  });

  it('returns an empty map when questions is an empty array', () => {
    expect(buildQuestionMap(JSON.stringify({ questions: [] }))).toEqual({});
  });

  it('preserves question order and duplicates', () => {
    const content = JSON.stringify({ questions: ['重复', '重复'] });

    const map = buildQuestionMap(content);

    expect(map['q0']).toBe('重复');
    expect(map['q1']).toBe('重复');
    expect(Object.keys(map)).toHaveLength(2);
  });

  it('ignores unrelated keys in the content payload', () => {
    const content = JSON.stringify({ questions: ['只有一问'], dimensions: [{ name: 'd1' }] });

    expect(buildQuestionMap(content)).toEqual({ q0: '只有一问' });
  });
});
