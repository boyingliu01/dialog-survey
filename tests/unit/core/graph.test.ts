import { describe, it, expect, beforeEach } from 'vitest';
import { runInterviewTurn, resetGraphInstance } from '../../../src/core/graph';
import type { InterviewTemplate, LLMProvider, LLMResponse } from '../../../src/core/types';
import { createInitialState } from '../../../src/core/state';

const mockTemplate: InterviewTemplate = {
  id: 'test-template',
  name: 'Test Interview',
  description: 'Test Description',
  topics: [
    { id: 'topic-1', name: 'Topic 1', description: 'Topic Description 1', initial_question: 'Initial 1' },
  ],
  questions: [
    { id: 'q1', type: 'text', text: 'Question 1' },
  ],
  domain_context: 'Domain Context',
};

class SimpleMockLLMProvider implements LLMProvider {
  response: LLMResponse = { content: 'Test response', isFollowupNeeded: false };

  async generateResponse(prompt: string, history: any[]): Promise<LLMResponse> {
    return this.response;
  }
}

describe('graph', () => {
  beforeEach(() => {
    // Reset graph instance before each test to ensure clean state
    resetGraphInstance();
  });

  describe('runInterviewTurn', () => {
    it('should run planning and transition to interviewing', async () => {
      const llm = new SimpleMockLLMProvider();
      llm.response = { content: 'Welcome to the interview!', isFollowupNeeded: false };
      
      const result = await runInterviewTurn(
        'session-1',
        'test-template',
        mockTemplate,
        null, // No user message for first turn
        llm
      );
      
      expect(result.sessionId).toBe('session-1');
      expect(result.interviewStatus).toBe('interviewing');
      expect(result.conversationHistory.length).toBeGreaterThan(0);
    });

    it('should process user answer in interviewing state', async () => {
      const llm = new SimpleMockLLMProvider();
      llm.response = { content: 'Next question', isFollowupNeeded: false };
      
      const result = await runInterviewTurn(
        'session-2',
        'test-template',
        mockTemplate,
        'User answer',
        llm
      );
      
      expect(result.conversationHistory.length).toBeGreaterThan(0);
      // Should have planning greeting + assistant response
    });

    it('should work without LLM provider', async () => {
      const result = await runInterviewTurn(
        'session-3',
        'test-template',
        mockTemplate,
        null
      );
      
      expect(result.sessionId).toBe('session-3');
      expect(result.interviewStatus).toBe('interviewing');
      expect(result.conversationHistory.length).toBe(1);
      expect(result.conversationHistory[0].content).toBe('欢迎参加访谈，我们开始吧！');
    });
  });
});