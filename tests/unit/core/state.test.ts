import { describe, it, expect } from 'vitest';
import { createInitialState, updateConversationHistory, extractUserAnswer } from '../../../src/core/state';
import { InterviewTemplate, InterviewState } from '../../../src/core/types';

const mockTemplate: InterviewTemplate = {
  id: 'test-template',
  name: 'Test Interview',
  description: 'Test Description',
  topics: [
    {
      id: 'topic-1',
      name: 'Topic 1',
      description: 'Topic Description',
      initial_question: 'Initial Question',
    },
  ],
  questions: [
    {
      id: 'q1',
      type: 'text',
      text: 'Question 1',
    },
  ],
  domain_context: 'Domain Context',
};

describe('state', () => {
  describe('createInitialState', () => {
    it('should create initial state with correct defaults', () => {
      const state = createInitialState('session-1', 'template-1', mockTemplate);
      
      expect(state.sessionId).toBe('session-1');
      expect(state.templateId).toBe('template-1');
      expect(state.template).toEqual(mockTemplate);
      expect(state.conversationHistory).toEqual([]);
      expect(state.currentTopicIndex).toBe(0);
      expect(state.currentQuestionIndex).toBe(0);
      expect(state.answers).toEqual({});
      expect(state.completedTopics).toEqual([]);
      expect(state.interviewStatus).toBe('planning');
      expect(state.followupNeeded).toBe(false);
    });
  });

  describe('updateConversationHistory', () => {
    it('should append message to conversation history', () => {
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      const newMessage = { role: 'user' as const, content: 'Hello' };
      
      const updatedState = updateConversationHistory(initialState, newMessage);
      
      expect(updatedState.conversationHistory.length).toBe(1);
      expect(updatedState.conversationHistory[0]).toEqual(newMessage);
    });
  });

  describe('extractUserAnswer', () => {
    it('should extract last user answer from conversation history', () => {
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      const stateWithMessages: InterviewState = {
        ...initialState,
        conversationHistory: [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Answer 1' },
          { role: 'assistant', content: 'Thanks' },
          { role: 'user', content: 'Final Answer' },
        ],
      };

      const answer = extractUserAnswer(stateWithMessages);
      
      expect(answer).toBe('Final Answer');
    });

    it('should return null when there are no user messages', () => {
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      const stateWithMessages: InterviewState = {
        ...initialState,
        conversationHistory: [
          { role: 'assistant', content: 'Hi' },
          { role: 'system', content: 'System message' },
        ],
      };

      const answer = extractUserAnswer(stateWithMessages);
      
      expect(answer).toBeNull();
    });
  });
});
