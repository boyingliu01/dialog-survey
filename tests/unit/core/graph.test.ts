import { describe, it, expect, vi } from 'vitest';
import { runInterview, runInterviewTurn } from '../../../src/core/graph';
import { InterviewTemplate, InterviewState, LLMProvider, LLMResponse } from '../../../src/core/types';
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
  describe('runInterview', () => {
    it('should run a complete interview', async () => {
      const llm = new SimpleMockLLMProvider();
      llm.response = { content: 'Welcome!', isFollowupNeeded: false };
      
      const result = await runInterview('session-1', 'template-1', mockTemplate, llm);
      
      expect(result.sessionId).toBe('session-1');
      expect(result.interviewStatus).toBe('completed');
      expect(result.report).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const errorLLM: LLMProvider = {
        async generateResponse(): Promise<LLMResponse> {
          throw new Error('LLM failed');
        },
      };
      
      const result = await runInterview('session-1', 'template-1', mockTemplate, errorLLM);
      
      expect(result.interviewStatus).toBe('completed');
      expect(result.error).toBe('LLM failed');
    });
  });

  describe('runInterviewTurn', () => {
    it('should process a single interview turn', async () => {
      const llm = new SimpleMockLLMProvider();
      llm.response = { content: 'Next question', isFollowupNeeded: false };
      
      const initialState: InterviewState = {
        ...createInitialState('session-1', 'template-1', mockTemplate),
        interviewStatus: 'interviewing',
        conversationHistory: [
          { role: 'user', content: 'User answer' },
        ],
      };
      
      const result = await runInterviewTurn(initialState, llm);
      
      expect(result.conversationHistory.length).toBeGreaterThan(0);
    });

    it('should handle timeouts', async () => {
      const slowLLM: LLMProvider = {
        async generateResponse(): Promise<LLMResponse> {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ content: 'Slow response', isFollowupNeeded: false }), 2000);
          });
        },
      };
      
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      const result = await runInterviewTurn(initialState, slowLLM, 100);
      
      expect(result.error).toContain('timeout');
    }, 5000);
  });
});
