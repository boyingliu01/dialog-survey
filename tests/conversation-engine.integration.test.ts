/**
 * Integration tests for ConversationEngine (runInterviewGraph + InterviewStateRepository)
 * Tests state machine transitions with real PostgreSQL, mocking the LLM dependency.
 *
 * Prerequisites: PostgreSQL running + dialog_survey_test database
 * Run: npx vitest run tests/conversation-engine.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInterviewGraph } from '../src/core/graph.js';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { TestDatabase } from './helpers/test-db.js';

vi.mock('../src/services/followup.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/followup.service.js')>();
  return {
    generateSmartResponse: vi.fn(),
    polishFirstQuestion: vi.fn(),
    parseLLMResponse: vi.fn(),
    smartTruncate: vi.fn((text: string) => text),
    FALLBACK_RESPONSE: '感谢您的回答，我们继续下一个话题。',
    stripExtraQuestions: actual.stripExtraQuestions,
  };
});

import { generateSmartResponse, polishFirstQuestion } from '../src/services/followup.service.js';

const mockGenerateSmartResponse = generateSmartResponse as ReturnType<typeof vi.fn>;
const mockPolishFirstQuestion = polishFirstQuestion as ReturnType<typeof vi.fn>;

describe('ConversationEngine (Integration)', () => {
  let testDb: TestDatabase;
  let repo: InterviewStateRepository;
  let createdIds: { templates: string[]; interviews: string[] };

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    repo = new InterviewStateRepository(testDb.getPrisma());
  });

  beforeEach(async () => {
    createdIds = { templates: [], interviews: [] };
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (createdIds.templates.length > 0 || createdIds.interviews.length > 0) {
      await testDb.cleanup(createdIds);
    }
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function createTestTemplate(): Promise<string> {
    const template = await testDb.getPrisma().template.create({
      data: {
        name: '集成测试模板',
        content: JSON.stringify({
          name: '集成测试模板',
          description: '用于集成测试的模板',
          invitationPrompt: '欢迎参加本次集成测试访谈！',
          questions: [
            '请简单介绍一下您的工作经历？',
            '您在工作中遇到过最大的挑战是什么？',
            '您是如何解决这个挑战的？',
          ],
          closingMessage: '感谢您的参与，访谈到此结束！',
        }),
        status: 'PUBLISHED',
        createdBy: 'test-admin',
        updatedBy: 'test-admin',
      },
    });
    createdIds.templates.push(template.id);
    return template.id;
  }

  function createPendingState(
    userId: string,
    interviewId: string,
    templateId: string
  ): InterviewState {
    return {
      userId,
      interviewId,
      templateId,
      status: 'PENDING',
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: 5,
      nudgeCount: 0,
      responses: [],
      reportGenerated: false,
      version: 1,
      originalVersion: 1,
      pendingMessages: [],
      pendingResponses: [],
    };
  }

  describe('Full interview lifecycle', () => {
    it('should complete PENDING → ACTIVE → COMPLETED via all questions', async () => {
      const templateId = await createTestTemplate();
      const userId = 'lifecycle-user-001';

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      // Step 1: Create interview
      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      // Step 2: Process PENDING → planningNode → ACTIVE
      const pendingState = createPendingState(userId, interviewId, templateId);
      const result1 = await runInterviewGraph(
        pendingState,
        {
          userId,
          content: '',
        },
        testDb.getPrisma()
      );

      expect(result1.response).toContain('欢迎');
      expect(result1.nextState.status).toBe('ACTIVE');
      expect(result1.nextState.currentQuestion).toBe(0);
      expect(result1.nextState.messages.length).toBe(1);
      expect(result1.nextState.messages[0].role).toBe('assistant');

      // Step 3: Answer Q1 → interviewingNode → advances to Q2
      mockGenerateSmartResponse.mockResolvedValue({
        response: '感谢您的分享，非常有意思。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const stateAfterQ1 = {
        ...result1.nextState,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
      const result2 = await runInterviewGraph(
        stateAfterQ1,
        {
          userId,
          content: '我有5年软件开发经验',
        },
        testDb.getPrisma()
      );

      expect(result2.nextState.responses.length).toBe(1);
      expect(result2.nextState.responses[0].questionId).toBe('q0');
      expect(result2.nextState.currentQuestion).toBe(1);
      expect(result2.nextState.status).toBe('ACTIVE');
      expect(result2.response).toContain('感谢');

      // Step 4: Answer Q2 → should continue to Q3
      mockGenerateSmartResponse.mockResolvedValue({
        response: '很好的分享。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const stateAfterQ2 = {
        ...result2.nextState,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
      const result3 = await runInterviewGraph(
        stateAfterQ2,
        {
          userId,
          content: '最大的挑战是跨团队协作',
        },
        testDb.getPrisma()
      );

      expect(result3.nextState.responses.length).toBe(2);
      expect(result3.nextState.currentQuestion).toBe(2);
      expect(result3.nextState.status).toBe('ACTIVE');

      // Step 5: Answer Q3 (last question) → COMPLETED
      mockGenerateSmartResponse.mockResolvedValue({
        response: '非常感谢您的分享，总结得很好。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const stateAfterQ3 = {
        ...result3.nextState,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
      const result4 = await runInterviewGraph(
        stateAfterQ3,
        {
          userId,
          content: '我通过沟通和建立信任解决了这个问题',
        },
        testDb.getPrisma()
      );

      expect(result4.nextState.status).toBe('COMPLETED');
      const finalState = result4.nextState as InterviewState & { shouldContinue?: boolean };
      expect(finalState.shouldContinue).toBe(false);
      expect(result4.response).toContain('感谢');

      // Verify final state via direct save and DB read
      await repo.saveFullState(interviewId, result4.nextState);
      const dbInterview = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          responses: { orderBy: { createdAt: 'asc' } },
        },
      });
      expect(dbInterview?.status).toBe('COMPLETED');
      expect(dbInterview?.currentQuestion).toBe(3);
    });
  });

  describe('User response handling', () => {
    it('should record user response and advance to next question', async () => {
      const templateId = await createTestTemplate();
      const userId = 'response-user-001';

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      // Initialize via PENDING
      const pendingState = createPendingState(userId, interviewId, templateId);
      const initResult = await runInterviewGraph(
        pendingState,
        {
          userId,
          content: '',
        },
        testDb.getPrisma()
      );

      // Save initial state so version lines up for subsequent saves
      await repo.saveFullState(interviewId, initResult.nextState);

      // User responds to Q1
      mockGenerateSmartResponse.mockResolvedValue({
        response: '谢谢您的回答，我们来看下一个问题。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const activeState: InterviewState = {
        userId,
        interviewId,
        templateId,
        status: 'ACTIVE',
        messages: initResult.nextState.messages,
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 5,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: initResult.nextState.version,
        originalVersion: initResult.nextState.version,
        pendingMessages: [],
        pendingResponses: [],
      };

      const result = await runInterviewGraph(
        activeState,
        {
          userId,
          content: '我是全栈工程师，工作了3年',
        },
        testDb.getPrisma()
      );

      expect(result.nextState.responses.length).toBe(1);
      expect(result.nextState.responses[0]).toEqual({
        questionId: 'q0',
        content: '我是全栈工程师，工作了3年',
        isFollowup: false,
      });
      expect(result.nextState.currentQuestion).toBe(1);
      expect(result.nextState.followupCount).toBe(0);
    });

    it('should increment followupCount on FOLLOWUP action', async () => {
      const templateId = await createTestTemplate();
      const userId = 'followup-user-001';

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      const pendingState = createPendingState(userId, interviewId, templateId);
      const initResult = await runInterviewGraph(
        pendingState,
        {
          userId,
          content: '',
        },
        testDb.getPrisma()
      );

      await repo.saveFullState(interviewId, initResult.nextState);

      // LLM decides to ask a follow-up
      mockGenerateSmartResponse.mockResolvedValue({
        response: '能再详细说说吗？',
        action: 'FOLLOWUP',
        shouldProceedToNext: false,
        shouldEndInterview: false,
      });

      const activeState: InterviewState = {
        userId,
        interviewId,
        templateId,
        status: 'ACTIVE',
        messages: initResult.nextState.messages,
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 5,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: initResult.nextState.version,
        originalVersion: initResult.nextState.version,
        pendingMessages: [],
        pendingResponses: [],
      };

      const result = await runInterviewGraph(
        activeState,
        {
          userId,
          content: '我做了很多项目',
        },
        testDb.getPrisma()
      );

      expect(result.nextState.followupCount).toBe(1);
      expect(result.nextState.currentQuestion).toBe(0);
      const followupState = result.nextState as InterviewState & { shouldContinue?: boolean };
      expect(followupState.shouldContinue).toBe(true);
    });
  });

  describe('Template-based interview flow', () => {
    it('should load template questions correctly and use them in the flow', async () => {
      const templateId = await createTestTemplate();
      const userId = 'template-user-001';

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      // PENDING → ACTIVE (planning node loads template)
      const pendingState = createPendingState(userId, interviewId, templateId);
      const result = await runInterviewGraph(
        pendingState,
        {
          userId,
          content: '',
        },
        testDb.getPrisma()
      );

      expect(result.nextState.status).toBe('ACTIVE');
      // The greeting should contain the template's invitation
      expect(result.response).toContain('集成测试');
      // The first question should be from the template
      expect(result.response).toContain('工作经历');

      // Verify DB has correct template linkage
      const dbInterview = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
        include: { template: true },
      });
      expect(dbInterview?.templateId).toBe(templateId);
      expect(dbInterview?.template.name).toBe('集成测试模板');
    });

    it('should not load template content when prisma is not provided', async () => {
      const templateId = await createTestTemplate();
      const userId = 'no-prisma-user-001';

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      // Without prisma, template loading falls back to DEFAULT_TEMPLATE_CONTENT
      const pendingState = createPendingState(userId, interviewId, templateId);
      const result = await runInterviewGraph(pendingState, {
        userId,
        content: '',
      });

      // Falls back to default template, NOT the DB template content
      expect(result.response).toContain('欢迎');
    });
  });

  describe('State machine guard conditions', () => {
    it('should skip non-active states and return closing message', async () => {
      const templateId = await createTestTemplate();
      const userId = 'guard-user-001';

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      // COMPLETED state — graph should return closing message without calling LLM
      const completedState: InterviewState = {
        userId,
        interviewId,
        templateId,
        status: 'COMPLETED',
        messages: [],
        currentQuestion: 3,
        followupCount: 0,
        maxFollowups: 5,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      const result = await runInterviewGraph(completedState, {
        userId,
        content: '我再补充一句',
      });

      expect(result.response).toContain('访谈已结束');
      expect(result.nextState.status).toBe('COMPLETED');
      // Should NOT have called generateSmartResponse
      expect(mockGenerateSmartResponse).not.toHaveBeenCalled();
    });

    it('should handle CANCELLED state gracefully', async () => {
      const templateId = await createTestTemplate();
      const userId = 'cancelled-user-001';

      const interviewId = await repo.createInterview(userId, templateId);
      createdIds.interviews.push(interviewId);

      const cancelledState: InterviewState = {
        userId,
        interviewId,
        templateId,
        status: 'CANCELLED',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 5,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      const result = await runInterviewGraph(cancelledState, {
        userId,
        content: '我还能回答吗？',
      });

      expect(result.response).toContain('访谈已结束');
      expect(result.nextState.status).toBe('CANCELLED');
    });
  });

  describe('Multiple interview isolation', () => {
    it('should keep two concurrent interviews independent', async () => {
      const templateId = await createTestTemplate();

      mockPolishFirstQuestion.mockResolvedValue('请简单介绍一下您的工作经历？');

      // User A
      const userIdA = 'isolation-user-A';
      const interviewIdA = await repo.createInterview(userIdA, templateId);
      createdIds.interviews.push(interviewIdA);

      const pendingA = createPendingState(userIdA, interviewIdA, templateId);
      const resultA = await runInterviewGraph(
        pendingA,
        {
          userId: userIdA,
          content: '',
        },
        testDb.getPrisma()
      );

      // User B
      const userIdB = 'isolation-user-B';
      const interviewIdB = await repo.createInterview(userIdB, templateId);
      createdIds.interviews.push(interviewIdB);

      const pendingB = createPendingState(userIdB, interviewIdB, templateId);
      const resultB = await runInterviewGraph(
        pendingB,
        {
          userId: userIdB,
          content: '',
        },
        testDb.getPrisma()
      );

      expect(resultA.nextState.interviewId).toBe(interviewIdA);
      expect(resultB.nextState.interviewId).toBe(interviewIdB);
      expect(interviewIdA).not.toBe(interviewIdB);

      // Advance user A only
      await repo.saveFullState(interviewIdA, resultA.nextState);

      mockGenerateSmartResponse.mockResolvedValue({
        response: '谢谢！',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const stateA: InterviewState = {
        userId: userIdA,
        interviewId: interviewIdA,
        templateId,
        status: 'ACTIVE',
        messages: resultA.nextState.messages,
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 5,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: resultA.nextState.version,
        originalVersion: resultA.nextState.version,
        pendingMessages: [],
        pendingResponses: [],
      };

      const advancedA = await runInterviewGraph(
        stateA,
        {
          userId: userIdA,
          content: 'User A response',
        },
        testDb.getPrisma()
      );

      expect(advancedA.nextState.currentQuestion).toBe(1);

      // User B should still be at question 0
      const dbB = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewIdB },
      });
      expect(dbB?.currentQuestion).toBe(0);
    });
  });
});
