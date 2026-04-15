import { describe, expect, it } from 'vitest';
import { promptService } from '../src/services/prompt.service.js';

describe('generateAcknowledgment', () => {
  describe('prompt template', () => {
    it('should have generateAcknowledgment template', () => {
      const template = promptService.getTemplate('generateAcknowledgment');
      expect(template).toBeDefined();
    });

    it('should have correct variables', () => {
      const template = promptService.getTemplate('generateAcknowledgment');
      expect(template?.variables).toContain('topic');
      expect(template?.variables).toContain('userAnswer');
    });

    it('should render correctly', () => {
      const rendered = promptService.render('generateAcknowledgment', {
        topic: '工作经历',
        userAnswer: '我在浩鲸工作',
      });
      expect(rendered).toContain('工作经历');
      expect(rendered).toContain('我在浩鲸工作');
    });
  });

  describe('function exports', () => {
    it('should export generateAcknowledgment function', async () => {
      const module = await import('../src/services/followup.service.js');
      expect(module.generateAcknowledgment).toBeDefined();
    });

    it('should have MIN_ANSWER_LENGTH_FOR_ACK constant', async () => {
      const content = await import('fs').then((fs) =>
        fs.default.readFileSync('src/services/followup.service.ts', 'utf-8')
      );
      expect(content).toContain('MIN_ANSWER_LENGTH_FOR_ACK');
    });
  });
});
