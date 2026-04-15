import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { promptService } from '../src/services/prompt.service.js';

const followupServiceContent = readFileSync('src/services/followup.service.ts', 'utf-8');

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

    it('should have MIN_ANSWER_LENGTH_FOR_ACK constant', () => {
      expect(followupServiceContent).toContain('MIN_ANSWER_LENGTH_FOR_ACK');
    });
  });

  describe('negative emotion patterns', () => {
    it('should have NEGATIVE_EMOTION_PATTERNS defined', () => {
      expect(followupServiceContent).toContain('NEGATIVE_EMOTION_PATTERNS');
    });

    it('should detect "不想谈" as negative emotion', () => {
      expect(followupServiceContent).toContain('不想谈');
    });

    it('should detect "真无聊" as negative emotion', () => {
      expect(followupServiceContent).toContain('真无聊');
    });

    it('should have EMPATHY_RESPONSES defined', () => {
      expect(followupServiceContent).toContain('EMPATHY_RESPONSES');
      expect(followupServiceContent).toContain('我理解您可能有些疲惫');
    });

    it('should have hasNegativeEmotion helper function', () => {
      expect(followupServiceContent).toContain('hasNegativeEmotion');
    });

    it('should have getEmpathyResponse helper function', () => {
      expect(followupServiceContent).toContain('getEmpathyResponse');
    });

    it('should have MIN_ANSWER_LENGTH_FOR_ACK set to 10', () => {
      expect(followupServiceContent).toContain('MIN_ANSWER_LENGTH_FOR_ACK = 10');
    });
  });
});
