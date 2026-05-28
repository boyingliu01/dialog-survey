// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  analysisConfigSchema,
  dimensionSchema,
  dimensionTagSchema,
  dimensionsArraySchema,
  validateDimensionTags,
  validateDimensions,
} from '../src/schemas/dimensions.js';

describe('Zod Schemas: Dimension Validation', () => {
  describe('dimensionSchema', () => {
    it('accepts valid dimension object', () => {
      const valid = {
        id: 'stability',
        label: '稳定性',
        description: '产品崩溃、闪退等问题',
        keywords: ['崩溃', '闪退', '卡顿'],
      };

      const result = dimensionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects dimension missing id', () => {
      const invalid = { label: '稳定性', keywords: [] };
      const result = dimensionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects dimension missing label', () => {
      const invalid = { id: 'stability', keywords: [] };
      const result = dimensionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('requires keywords to be array of strings', () => {
      const invalid = {
        id: 'stability',
        label: '稳定性',
        keywords: 'not-an-array',
      };
      const result = dimensionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('accepts minimal dimension with only id and label', () => {
      const minimal = { id: 'stability', label: '稳定性' };
      const result = dimensionSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });
  });

  describe('dimensionsArraySchema', () => {
    it('accepts valid dimensions array', () => {
      const valid = [
        { id: 'stability', label: '稳定性', keywords: ['崩溃'] },
        { id: 'performance', label: '性能', keywords: ['慢'] },
      ];

      const result = dimensionsArraySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects array with invalid dimension', () => {
      const invalid = [{ id: 'stability', label: '稳定性' }, { label: 'missing id' }];

      const result = dimensionsArraySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('accepts empty array', () => {
      const result = dimensionsArraySchema.safeParse([]);
      expect(result.success).toBe(true);
    });
  });

  describe('analysisConfigSchema', () => {
    it('accepts valid analysisConfig', () => {
      const valid = {
        emergentThreshold: 3,
        customSentimentWords: {
          positive: ['好转', '改善'],
          negative: ['退步', '更差'],
        },
      };

      const result = analysisConfigSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('accepts empty config', () => {
      const result = analysisConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('dimensionTagSchema', () => {
    it('accepts valid dimension tag', () => {
      const valid = {
        dimensionId: 'stability',
        label: '稳定性',
        sentiment: 'negative',
        quotes: ['每次升级要重启3次'],
      };

      const result = dimensionTagSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sentiment value', () => {
      const invalid = {
        dimensionId: 'stability',
        label: '稳定性',
        sentiment: 'angry',
        quotes: [],
      };

      const result = dimensionTagSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('validateDimensions helper', () => {
    /**
     * @test REQ-SAFETY-001
     * @intent verify valid dimensions JSON is parsed and validated
     * @covers AC-SAFETY-001-01
     */
    it('returns parsed dimensions for valid input', () => {
      const valid = [{ id: 'stability', label: '稳定性' }];
      const result = validateDimensions(JSON.stringify(valid));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('stability');
      }
    });

    /** @test REQ-SAFETY-001 @intent verify invalid JSON returns error, not crash @covers AC-SAFETY-001-01 */
    it('returns error for invalid JSON', () => {
      const result = validateDimensions('not json');
      expect(result.success).toBe(false);
    });

    /** @test REQ-SAFETY-001 @intent reject invalid dimension structure @covers AC-SAFETY-001-01 */
    it('returns error for invalid structure', () => {
      const invalid = JSON.stringify([{ label: 'missing id' }]);
      const result = validateDimensions(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('validateDimensionTags helper', () => {
    it('returns parsed tags for valid input', () => {
      const valid = JSON.stringify([
        {
          dimensionId: 'stability',
          label: '稳定性',
          sentiment: 'negative',
          quotes: ['test'],
        },
      ]);
      const result = validateDimensionTags(valid);
      expect(result.success).toBe(true);
    });

    it('accepts null (no dimensions defined)', () => {
      const result = validateDimensionTags(null);
      expect(result.success).toBe(true);
    });
  });
});
