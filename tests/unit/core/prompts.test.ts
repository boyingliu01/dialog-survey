import { describe, it, expect } from 'vitest';
import { PLANNING_PROMPT, INTERVIEW_PROMPT, FOLLOWUP_PROMPT, ANALYZE_PROMPT } from '../../../src/core/prompts';
import { InterviewTemplate } from '../../../src/core/types';

const mockTemplate: InterviewTemplate = {
  id: 'test-template',
  name: 'Test Interview',
  description: 'Test Description',
  topics: [
    {
      id: 'topic-1',
      name: 'Topic 1',
      description: 'Topic Description 1',
      initial_question: 'Initial Question 1',
    },
    {
      id: 'topic-2',
      name: 'Topic 2',
      description: 'Topic Description 2',
      initial_question: 'Initial Question 2',
    },
  ],
  questions: [
    { id: 'q1', type: 'text', text: 'Question 1' },
    { id: 'q2', type: 'text', text: 'Question 2' },
  ],
  domain_context: 'Domain Context',
};

describe('prompts', () => {
  describe('PLANNING_PROMPT', () => {
    it('should generate planning prompt with template information', () => {
      const prompt = PLANNING_PROMPT(mockTemplate);
      
      expect(prompt).toContain(mockTemplate.name);
      expect(prompt).toContain(mockTemplate.description);
      expect(prompt).toContain(mockTemplate.topics[0].name);
      expect(prompt).toContain(mockTemplate.topics[0].description);
      expect(prompt).toContain(mockTemplate.topics[0].initial_question);
    });
  });

  describe('INTERVIEW_PROMPT', () => {
    it('should generate interview prompt with current topic and question', () => {
      const prompt = INTERVIEW_PROMPT(mockTemplate, 0, 0);
      
      expect(prompt).toContain(mockTemplate.topics[0].name);
      expect(prompt).toContain(mockTemplate.topics[0].description);
      expect(prompt).toContain(mockTemplate.questions[0].text);
    });
  });

  describe('FOLLOWUP_PROMPT', () => {
    it('should generate followup prompt with original question and user answer', () => {
      const prompt = FOLLOWUP_PROMPT('What is your experience?', 'Not much');
      
      expect(prompt).toContain('What is your experience?');
      expect(prompt).toContain('Not much');
    });
  });

  describe('ANALYZE_PROMPT', () => {
    it('should generate analyze prompt with template information', () => {
      const prompt = ANALYZE_PROMPT(mockTemplate);
      
      expect(prompt).toContain(mockTemplate.topics[0].name);
      expect(prompt).toContain(mockTemplate.topics[0].description);
      expect(prompt).toContain(mockTemplate.domain_context);
    });
  });
});
