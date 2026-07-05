/**
 * Integration tests for InterviewStateRepository (stream-message data layer)
 * Tests state persistence, transitions, and interview lifecycle with real DB
 *
 * Prerequisites: PostgreSQL running + dialog_survey_test database
 * Run: npx vitest run tests/stream-message.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { TestDatabase } from './helpers/test-db.js';

describe('InterviewStateRepository (Integration)', () => {
  let testDb: TestDatabase;
  let repo: InterviewStateRepository;
  let templateId: string;
  let createdIds: { templates: string[]; interviews: string[] };

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    repo = new InterviewStateRepository(testDb.getPrisma());
  });

  beforeEach(async () => {
    createdIds = { templates: [], interviews: [] };

    const template = await testDb.getPrisma().template.create({
      data: {
        name: '测试模板',
        content: JSON.stringify({
          invitationPrompt: '欢迎参加访谈',
          questions: ['Q1', 'Q2', 'Q3'],
        }),
        status: 'DRAFT',
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    createdIds.templates.push(template.id);
    templateId = template.id;
  });

  afterEach(async () => {
    await testDb.cleanup(createdIds);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  describe('createInterview', () => {
    it('should create interview with PENDING status', async () => {
      const interviewId = await repo.createInterview('user-001', templateId);
      createdIds.interviews.push(interviewId);

      expect(interviewId).toBeDefined();

      const interview = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
      });
      expect(interview).not.toBeNull();
      expect(interview?.userId).toBe('user-001');
      expect(interview?.templateId).toBe(templateId);
      expect(interview?.status).toBe('PENDING');
      expect(interview?.currentQuestion).toBe(0);
      expect(interview?.version).toBe(1);
    });
  });

  describe('findActiveInterview', () => {
    it('should find interview in ACTIVE status', async () => {
      const interview = await testDb.getPrisma().interview.create({
        data: {
          userId: 'user-002',
          templateId,
          status: 'ACTIVE',
        },
      });
      createdIds.interviews.push(interview.id);

      const state = await repo.findActiveInterview('user-002');
      expect(state).not.toBeNull();
      expect(state?.userId).toBe('user-002');
      expect(state?.status).toBe('ACTIVE');
    });

    it('should find interview in WAITING status', async () => {
      const interview = await testDb.getPrisma().interview.create({
        data: {
          userId: 'user-003',
          templateId,
          status: 'WAITING',
        },
      });
      createdIds.interviews.push(interview.id);

      const state = await repo.findActiveInterview('user-003');
      expect(state).not.toBeNull();
      expect(state?.status).toBe('WAITING');
    });

    it('should return null for non-existent user', async () => {
      const state = await repo.findActiveInterview('non-existent-user');
      expect(state).toBeNull();
    });

    it('should return null for COMPLETED interview', async () => {
      const interview = await testDb.getPrisma().interview.create({
        data: {
          userId: 'user-004',
          templateId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      createdIds.interviews.push(interview.id);

      const state = await repo.findActiveInterview('user-004');
      expect(state).toBeNull();
    });
  });

  describe('findCompletedInterview', () => {
    it('should find completed interview and return completedAt + templateId', async () => {
      const interview = await testDb.getPrisma().interview.create({
        data: {
          userId: 'user-005',
          templateId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      createdIds.interviews.push(interview.id);

      const result = await repo.findCompletedInterview('user-005');
      expect(result).not.toBeNull();
      expect(result?.templateId).toBe(templateId);
      expect(result?.completedAt).toBeInstanceOf(Date);
    });

    it('should return null for active interview', async () => {
      const interview = await testDb.getPrisma().interview.create({
        data: {
          userId: 'user-006',
          templateId,
          status: 'ACTIVE',
        },
      });
      createdIds.interviews.push(interview.id);

      const result = await repo.findCompletedInterview('user-006');
      expect(result).toBeNull();
    });
  });

  describe('saveState', () => {
    it('should persist state changes to DB with correct version', async () => {
      const interviewId = await repo.createInterview('user-007', templateId);
      createdIds.interviews.push(interviewId);

      const state = {
        userId: 'user-007',
        interviewId,
        templateId,
        status: 'ACTIVE' as const,
        messages: [{ role: 'assistant' as const, content: 'Q1: 你的工作经验？' }],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      await repo.saveState({ interviewId, state, version: 1 });

      // Verify in DB
      const interview = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
      });
      expect(interview?.status).toBe('ACTIVE');
      expect(interview?.currentQuestion).toBe(1);
      expect(interview?.version).toBe(2);

      // Verify message was persisted
      const messages = await testDb.getPrisma().message.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Q1: 你的工作经验？');
    });

    it('should persist user responses', async () => {
      const interviewId = await repo.createInterview('user-008', templateId);
      createdIds.interviews.push(interviewId);

      const state = {
        userId: 'user-008',
        interviewId,
        templateId,
        status: 'ACTIVE' as const,
        messages: [
          { role: 'assistant' as const, content: 'Q1' },
          { role: 'user' as const, content: '我的回答' },
        ],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        nudgeCount: 0,
        responses: [{ questionId: 'q1', content: '我的回答', isFollowup: false, followupDepth: 0 }],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      await repo.saveState({ interviewId, state, version: 1 });

      // Verify responses persisted
      const responses = await testDb.getPrisma().response.findMany({
        where: { interviewId },
      });
      expect(responses.length).toBe(1);
      expect(responses[0].content).toBe('我的回答');
      expect(responses[0].questionId).toBe('q1');
    });

    it('should reject save with wrong version (optimistic locking)', async () => {
      const interviewId = await repo.createInterview('user-009', templateId);
      createdIds.interviews.push(interviewId);

      const state = {
        userId: 'user-009',
        interviewId,
        templateId,
        status: 'ACTIVE' as const,
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      await expect(
        repo.saveState({ interviewId, state, version: 5 })
      ).rejects.toThrow();
    });
  });

  describe('Interview lifecycle (full flow)', () => {
    it('should support PENDING → ACTIVE → COMPLETED transition', async () => {
      const prisma = testDb.getPrisma();

      const interviewId = await repo.createInterview('user-010', templateId);
      createdIds.interviews.push(interviewId);
      let interview = await prisma.interview.findUnique({ where: { id: interviewId } });
      expect(interview?.status).toBe('PENDING');

      const activeBefore = await repo.findActiveInterview('user-010');
      expect(activeBefore).not.toBeNull();

      const state = {
        userId: 'user-010',
        interviewId,
        templateId,
        status: 'ACTIVE' as const,
        messages: [{ role: 'assistant' as const, content: 'Q1' }],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        nudgeCount: 0,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
      await repo.saveState({ interviewId, state, version: 1 });

      const activeAfter = await repo.findActiveInterview('user-010');
      expect(activeAfter).not.toBeNull();
      expect(activeAfter?.status).toBe('ACTIVE');

      await prisma.interview.update({
        where: { id: interviewId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      interview = await prisma.interview.findUnique({ where: { id: interviewId } });
      expect(interview?.status).toBe('COMPLETED');

      const completed = await repo.findCompletedInterview('user-010');
      expect(completed).not.toBeNull();

      const activeAfterComplete = await repo.findActiveInterview('user-010');
      expect(activeAfterComplete).toBeNull();
    });
  });

  describe('Multiple users isolation', () => {
    it('should keep interviews isolated between users', async () => {
      const prisma = testDb.getPrisma();
      const idA = await repo.createInterview('user-A', templateId);
      createdIds.interviews.push(idA);
      const idB = await repo.createInterview('user-B', templateId);
      createdIds.interviews.push(idB);

      expect(idA).not.toBe(idB);

      await prisma.interview.update({
        where: { id: idA },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const completedA = await repo.findCompletedInterview('user-A');
      const completedB = await repo.findCompletedInterview('user-B');
      expect(completedA).not.toBeNull();
      expect(completedB).toBeNull();

      const activeA = await repo.findActiveInterview('user-A');
      const activeB = await repo.findActiveInterview('user-B');
      expect(activeA).toBeNull();
      expect(activeB).not.toBeNull();
    });
  });
});
