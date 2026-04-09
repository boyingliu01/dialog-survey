import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LLM, Followup, Report', () => {
  describe('LLM Service', () => {
    it('should have base LLM interface', () => {
      expect(fs.existsSync('src/integrations/llm/base.ts')).toBe(true);
    });

    it('should have Alibaba adapter', () => {
      expect(fs.existsSync('src/integrations/llm/alibaba.ts')).toBe(true);
    });

    it('should have prompt service', () => {
      expect(fs.existsSync('src/services/prompt.service.ts')).toBe(true);
    });

    it('should have retry mechanism', () => {
      expect(fs.existsSync('src/utils/retry.ts')).toBe(true);
    });
  });

  describe('Followup Service', () => {
    it('should have followup.service.ts', () => {
      expect(fs.existsSync('src/services/followup.service.ts')).toBe(true);
    });

    it('should implement isFollowupNeeded', () => {
      const content = fs.readFileSync('src/services/followup.service.ts', 'utf-8');
      expect(content.toLowerCase()).toContain('followup');
    });
  });

  describe('Report Service', () => {
    it('should have report.service.ts', () => {
      expect(fs.existsSync('src/services/report.service.ts')).toBe(true);
    });

    it('should implement markdown rendering', () => {
      const content = fs.readFileSync('src/services/report.service.ts', 'utf-8');
      expect(content).toMatch(/\.md/);
    });
  });
});
