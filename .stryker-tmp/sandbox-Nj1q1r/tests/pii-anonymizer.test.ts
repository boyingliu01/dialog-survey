// @ts-nocheck
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-SAFETY-002
 * @intent verify PII in quotes is anonymized before appearing in reports
 * @covers AC-SAFETY-002-01
 */
describe('PII Anonymization', () => {
  it('anonymizes Chinese names in quotes', async () => {
    const { anonymizePII } = await import('../src/utils/pii-anonymizer.js');
    const result = anonymizePII('张三说产品不稳定，李四也同意');
    expect(result).toContain('[匿名用户]');
    expect(result).not.toContain('张三');
    expect(result).not.toContain('李四');
  });

  it('masks phone numbers', async () => {
    const { anonymizePII } = await import('../src/utils/pii-anonymizer.js');
    const result = anonymizePII('我的电话是13812345678');
    expect(result).toContain('138****5678');
    expect(result).not.toContain('13812345678');
  });

  it('handles mixed PII', async () => {
    const { anonymizePII } = await import('../src/utils/pii-anonymizer.js');
    const result = anonymizePII('王五的邮箱wangwu@test.com和13812345678');
    expect(result).not.toContain('wangwu@test.com');
  });

  it('preserves non-PII content', async () => {
    const { anonymizePII } = await import('../src/utils/pii-anonymizer.js');
    const result = anonymizePII('产品质量很好');
    expect(result).toBe('产品质量很好');
  });

  it('returns empty string for empty input', async () => {
    const { anonymizePII } = await import('../src/utils/pii-anonymizer.js');
    expect(anonymizePII('')).toBe('');
  });
});
