import { describe, it, expect, vi } from 'vitest';
import { planningNode, interviewNode, followupNode, analyzeNode } from '../../../src/core/nodes';
import { InterviewState, InterviewTemplate, LLMProvider, LLMResponse } from '../../../src/core/types';
import { createInitialState } from '../../../src/core/state';

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

class MockLLMProvider implements LLMProvider {
  response: LLMResponse = { content: 'Test response', isFollowupNeeded: false };
  generateResponseCalls: { prompt: string; history: any[] }[] = [];

  async generateResponse(prompt: string, history: any[]): Promise<LLMResponse> {
    this.generateResponseCalls.push({ prompt, history });
    return this.response;
  }
}

describe('nodes', () => {
  describe('planningNode', () => {
    it('should generate welcome message and set status to interviewing', async () => {
      const llm = new MockLLMProvider();
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      
      const result = await planningNode(initialState, llm);
      
      expect(result.interviewStatus).toBe('interviewing');
      expect(result.conversationHistory).toHaveLength(1);
      expect(result.conversationHistory![0].role).toBe('assistant');
      expect(result.conversationHistory![0].content).toContain(mockTemplate.name);
    });
  });

  describe('interviewNode', () => {
    it('should process user answer and generate next question', async () => {
      const llm = new MockLLMProvider();
      const initialState: InterviewState = {
        ...createInitialState('session-1', 'template-1', mockTemplate),
        conversationHistory: [
          { role: 'user', content: 'My answer' },
        ],
      };
      
      const result = await interviewNode(initialState, llm);
      
      expect(result.answers).toEqual({ q0_0: 'My answer' });
      expect(result.conversationHistory).toHaveLength(2);
      expect(result.currentQuestionIndex).toBe(1);
    });

    it('should move to next topic when all questions are done', async () => {
      const llm = new MockLLMProvider();
      const initialState: InterviewState = {
        ...createInitialState('session-1', 'template-1', mockTemplate),
        currentQuestionIndex: 1, // Last question
        conversationHistory: [
          { role: 'user', content: 'Final answer' },
        ],
      };
      
      const result = await interviewNode(initialState, llm);
      
      expect(result.completedTopics).toEqual(['topic-1']);
      expect(result.currentTopicIndex).toBe(1);
      expect(result.currentQuestionIndex).toBe(0);
    });

    it('should set followupNeeded when LLM indicates followup is needed', async () => {
      const llm = new MockLLMProvider();
      llm.response = { content: 'Need more info', isFollowupNeeded: true, followupQuestion: 'Can you elaborate?' };
      const initialState: InterviewState = {
        ...createInitialState('session-1', 'template-1', mockTemplate),
        conversationHistory: [
          { role: 'user', content: 'Short answer' },
        ],
      };
      
      const result = await interviewNode(initialState, llm);
      
      expect(result.followupNeeded).toBe(true);
      expect(result.followupQuestion).toBe('Can you elaborate?');
    });
  });

  describe('followupNode', () => {
    it('should generate followup question and reset to interviewing', async () => {
      const llm = new MockLLMProvider();
      const initialState: InterviewState = {
        ...createInitialState('session-1', 'template-1', mockTemplate),
        followupNeeded: true,
        followupQuestion: 'Tell me more',
        conversationHistory: [
          { role: 'user', content: 'Short answer' },
        ],
      };
      
      const result = await followupNode(initialState, llm);
      
      expect(result.interviewStatus).toBe('interviewing');
      expect(result.followupNeeded).toBe(false);
      expect(result.followupQuestion).toBeUndefined();
      expect(result.conversationHistory).toHaveLength(2);
    });
  });

  describe('analyzeNode', () => {
    it('should generate report and set status to completed', async () => {
      const llm = new MockLLMProvider();
      llm.response = { content: 'Interview report content', isFollowupNeeded: false };
      const initialState = createInitialState('session-1', 'template-1', mockTemplate);
      
      const result = await analyzeNode(initialState, llm);
      
      expect(result.report).toBe('Interview report content');
      expect(result.interviewStatus).toBe('completed');
      expect(result.endTime).toBeDefined();
    });
  });
});
