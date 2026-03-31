import { describe, it, expect } from 'vitest';
import { shouldContinue, shouldFollowup, isInterviewComplete } from '../../../src/core/edges';
import type { InterviewState } from '../../../src/core/state';
import type { InterviewTemplate } from '../../../src/core/types';

const mockTemplate: InterviewTemplate = {
  id: 'test-template',
  name: 'Test Interview',
  description: 'Test Description',
  topics: [
    { id: 'topic-1', name: 'Topic 1', description: 'Topic Description 1', initial_question: 'Initial 1' },
    { id: 'topic-2', name: 'Topic 2', description: 'Topic Description 2', initial_question: 'Initial 2' },
  ],
  questions: [
    { id: 'q1', type: 'text', text: 'Question 1' },
    { id: 'q2', type: 'text', text: 'Question 2' },
  ],
  domain_context: 'Domain Context',
};

function createMockState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    sessionId: 'session-1',
    templateId: 'template-1',
    template: mockTemplate,
    conversationHistory: [],
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    completedTopics: [],
    interviewStatus: 'interviewing',
    followupNeeded: false,
    startTime: new Date(),
    ...overrides,
  };
}

describe('edges', () => {
  describe('shouldContinue', () => {
    it('should return "followup" when followup is needed', () => {
      const state = createMockState({ followupNeeded: true });
      expect(shouldContinue(state)).toBe('followup');
    });

    it('should return "analyzing" when interview is complete', () => {
      const state = createMockState({
        completedTopics: ['topic-1', 'topic-2'],
      });
      expect(shouldContinue(state)).toBe('analyzing');
    });

    it('should return "interviewing" when interview is in progress', () => {
      const state = createMockState();
      expect(shouldContinue(state)).toBe('interviewing');
    });
  });

  describe('shouldFollowup', () => {
    it('should return true when followup is needed', () => {
      const state = createMockState({ followupNeeded: true });
      expect(shouldFollowup(state)).toBe(true);
    });

    it('should return false when followup is not needed', () => {
      const state = createMockState({ followupNeeded: false });
      expect(shouldFollowup(state)).toBe(false);
    });
  });

  describe('isInterviewComplete', () => {
    it('should return true when all topics are completed', () => {
      const state = createMockState({
        completedTopics: ['topic-1', 'topic-2'],
      });
      expect(isInterviewComplete(state)).toBe(true);
    });

    it('should return false when not all topics are completed', () => {
      const state = createMockState({
        completedTopics: ['topic-1'],
      });
      expect(isInterviewComplete(state)).toBe(false);
    });
  });
});