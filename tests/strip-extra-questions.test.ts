import { describe, expect, it } from 'vitest';
import { stripExtraQuestions } from '../src/services/followup.service.js';

describe('stripExtraQuestions', () => {
  it('should return unchanged response when no question marks', () => {
    const response = '感谢您的分享，这很有价值。';
    expect(stripExtraQuestions(response)).toBe(response);
  });

  it('should return unchanged response when only one question mark', () => {
    const response = '您觉得这个挑战大吗？';
    expect(stripExtraQuestions(response)).toBe(response);
  });

  it('should strip to first question when multiple question marks', () => {
    const response = '您觉得这个挑战大吗？具体是什么挑战？您能描述一下吗？';
    const result = stripExtraQuestions(response);
    expect(result).toBe('您觉得这个挑战大吗？');
    expect(result).not.toContain('具体是什么挑战');
    expect(result).not.toContain('您能描述一下吗');
  });

  it('should keep only up to first question mark', () => {
    const response = '您觉得怎么样？那很好。还有其他问题吗？';
    const result = stripExtraQuestions(response);
    expect(result).toBe('您觉得怎么样？');
  });

  it('should handle Chinese punctuation', () => {
    const response = '您的感受如何？能详细说说吗？有什么建议吗？';
    const result = stripExtraQuestions(response);
    expect(result).toBe('您的感受如何？');
  });

  it('should handle response with newline after first question', () => {
    const response = '您觉得怎么样？\n还有其他问题吗？';
    const result = stripExtraQuestions(response);
    expect(result).toBe('您觉得怎么样？');
  });

  it('should handle empty response', () => {
    expect(stripExtraQuestions('')).toBe('');
  });

  it('should handle response with only question marks', () => {
    const response = '？？？';
    const result = stripExtraQuestions(response);
    expect(result).toBe('？');
  });
});
