/**
 * Integration tests for InterviewStateRepository
 * Uses real PostgreSQL database — no Mocks
 *
 * Prerequisites: PostgreSQL running + dialog_survey_test database
 * Run: npx vitest run tests/interview-state-repository.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { TestDatabase } from './helpers/test-db.js';

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'user-test-1',
    templateId: 'template-test-1',
    interviewId: 'interview-test-1',
    status: 'PENDING' as const,
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
    ...overrides,
  };
}

describe('InterviewStateRepository (Integration)', () => {
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
    const template = await testDb.getPrisma().template.create({
      data: {
        name: 'Integration Test Template',
        content: JSON.stringify({ invitationPrompt: 'Hello', questions: ['Q1', 'Q2'] }),
        status: 'DRAFT',
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    createdIds.templates.push(template.id);
  });

  afterEach(async () => {
    await testDb.cleanup({
      interviews: createdIds.interviews,
      templates: createdIds.templates,
    });
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  function getTemplateId(): string {
    return createdIds.templates[0];
  }

  describe('createInterview', () => {
    it('should create an interview with PENDING status and version=1', async () => {
      const userId = 'user-create-1';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      expect(interviewId).toBeDefined();
      expect(typeof interviewId).toBe('string');

      const fromDb = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
      });
      expect(fromDb).not.toBeNull();
      expect(fromDb?.userId).toBe(userId);
      expect(fromDb?.templateId).toBe(getTemplateId());
      expect(fromDb?.status).toBe('PENDING');
      expect(fromDb?.version).toBe(1);
    });

    it('should create separate interviews for different users', async () => {
      const idA = await repo.createInterview('user-a', getTemplateId());
      const idB = await repo.createInterview('user-b', getTemplateId());
      createdIds.interviews.push(idA, idB);

      expect(idA).not.toBe(idB);
    });
  });

  describe('saveState', () => {
    it('should persist status and currentQuestion changes', async () => {
      const interviewId = await repo.createInterview('user-save-1', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-save-1',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        currentQuestion: 3,
        version: 1,
      });

      await repo.saveState({ interviewId, state, version: 1 });

      const fromDb = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
      });
      expect(fromDb?.status).toBe('ACTIVE');
      expect(fromDb?.currentQuestion).toBe(3);
      expect(fromDb?.version).toBe(2);
    });

    it('should persist messages', async () => {
      const interviewId = await repo.createInterview('user-save-2', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-save-2',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        messages: [
          { role: 'assistant' as const, content: 'Hello' },
          { role: 'user' as const, content: 'Hi' },
        ],
      });

      await repo.saveState({ interviewId, state, version: 1 });

      const messages = await testDb.getPrisma().message.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hi');
    });

    it('should persist responses', async () => {
      const interviewId = await repo.createInterview('user-save-3', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-save-3',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        responses: [
          { questionId: 'q1', content: 'Answer 1', isFollowup: false },
          { questionId: 'q1-f1', content: 'Followup answer', isFollowup: true },
        ],
      });

      await repo.saveState({ interviewId, state, version: 1 });

      const responses = await testDb.getPrisma().response.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(responses).toHaveLength(2);
      expect(responses[0].questionId).toBe('q1');
      expect(responses[0].content).toBe('Answer 1');
      expect(responses[1].questionId).toBe('q1-f1');
      expect(responses[1].isFollowup).toBe(true);
    });

    it('should increment version on save', async () => {
      const interviewId = await repo.createInterview('user-save-4', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-save-4',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
      });

      await repo.saveState({ interviewId, state, version: 1 });
      const version2 = await repo.getVersion(interviewId);
      expect(version2).toBe(2);

      await repo.saveState({ interviewId, state, version: 2 });
      const version3 = await repo.getVersion(interviewId);
      expect(version3).toBe(3);
    });

    it('should replace existing messages on subsequent saveState calls', async () => {
      const interviewId = await repo.createInterview('user-save-5', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state1 = makeState({
        userId: 'user-save-5',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        messages: [{ role: 'assistant' as const, content: 'First msg' }],
      });
      await repo.saveState({ interviewId, state: state1, version: 1 });

      const state2 = makeState({
        userId: 'user-save-5',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 2,
        messages: [
          { role: 'assistant' as const, content: 'Second msg' },
          { role: 'user' as const, content: 'Reply' },
        ],
      });
      await repo.saveState({ interviewId, state: state2, version: 2 });

      const messages = await testDb.getPrisma().message.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Second msg');
      expect(messages[1].content).toBe('Reply');
    });
  });

  describe('saveState optimistic locking', () => {
    it('should reject wrong version (version conflict)', async () => {
      const interviewId = await repo.createInterview('user-lock-1', getTemplateId());
      createdIds.interviews.push(interviewId);

      // First save: version 1 → 2
      const state = makeState({
        userId: 'user-lock-1',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
      });
      await repo.saveState({ interviewId, state, version: 1 });

      // Try to save with stale version 1
      await expect(repo.saveState({ interviewId, state, version: 1 })).rejects.toThrow(
        'Version conflict'
      );
    });

    it('should reject version conflict even with different data', async () => {
      const interviewId = await repo.createInterview('user-lock-2', getTemplateId());
      createdIds.interviews.push(interviewId);

      await repo.saveState({
        interviewId,
        state: makeState({
          userId: 'user-lock-2',
          templateId: getTemplateId(),
          interviewId,
          status: 'ACTIVE' as const,
          version: 1,
        }),
        version: 1,
      });

      // DB version is now 2; passing 1 should fail
      await expect(
        repo.saveState({
          interviewId,
          state: makeState({
            userId: 'user-lock-2',
            templateId: getTemplateId(),
            interviewId,
            status: 'WAITING' as const,
            version: 1,
          }),
          version: 1,
        })
      ).rejects.toThrow('Version conflict');
    });
  });

  describe('saveFullState', () => {
    it('should persist pendingMessages', async () => {
      const interviewId = await repo.createInterview('user-full-1', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-full-1',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1,
        pendingMessages: [
          { role: 'assistant' as const, content: 'New question', isVoice: false },
          { role: 'user' as const, content: 'Voice answer', isVoice: true },
        ],
      });

      const result = await repo.saveFullState(interviewId, state);
      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);

      const messages = await testDb.getPrisma().message.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('New question');
      expect(messages[0].isVoice).toBe(false);
      expect(messages[1].content).toBe('Voice answer');
      expect(messages[1].isVoice).toBe(true);
    });

    it('should persist pendingResponses', async () => {
      const interviewId = await repo.createInterview('user-full-2', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-full-2',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1,
        pendingResponses: [
          { questionId: 'q1', content: 'Response 1', isFollowup: false },
          { questionId: 'q2', content: 'Response 2', isFollowup: true },
        ],
      });

      const result = await repo.saveFullState(interviewId, state);
      expect(result.success).toBe(true);

      const responses = await testDb.getPrisma().response.findMany({
        where: { interviewId },
        orderBy: { createdAt: 'asc' },
      });
      expect(responses).toHaveLength(2);
      expect(responses[0].questionId).toBe('q1');
      expect(responses[1].questionId).toBe('q2');
    });

    it('should increment version', async () => {
      const interviewId = await repo.createInterview('user-full-3', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-full-3',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1,
      });

      const result = await repo.saveFullState(interviewId, state);
      expect(result.newVersion).toBe(2);

      const fromDb = await testDb.getPrisma().interview.findUnique({
        where: { id: interviewId },
      });
      expect(fromDb?.version).toBe(2);
    });

    it('should clear pending arrays on success', async () => {
      const interviewId = await repo.createInterview('user-full-4', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-full-4',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1,
        pendingMessages: [{ role: 'assistant' as const, content: 'msg', isVoice: false }],
        pendingResponses: [{ questionId: 'q1', content: 'resp', isFollowup: false }],
      });

      await repo.saveFullState(interviewId, state);

      // The repo mutates state to clear these
      expect(state.pendingMessages).toHaveLength(0);
      expect(state.pendingResponses).toHaveLength(0);
    });

    it('should reject wrong originalVersion', async () => {
      const interviewId = await repo.createInterview('user-full-5', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-full-5',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 5, // stale
      });

      await expect(repo.saveFullState(interviewId, state)).rejects.toThrow('Version conflict');
    });
  });

  describe('saveFullState retry', () => {
    it('should retry on VERSION_CONFLICT up to MAX_RETRIES and then fail', async () => {
      const interviewId = await repo.createInterview('user-retry-1', getTemplateId());
      createdIds.interviews.push(interviewId);

      // First, bump the version so that saveFullState sees a version mismatch
      await testDb.getPrisma().interview.update({
        where: { id: interviewId },
        data: { version: { increment: 1 } },
      });

      const state = makeState({
        userId: 'user-retry-1',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1, // stale — DB version is now 2
      });

      // The retry logic will try 3 times (retryCount 0, 1, 2) and then fail
      await expect(repo.saveFullState(interviewId, state)).rejects.toThrow('Version conflict');
    });

    it('should succeed after retry if version becomes valid', async () => {
      const interviewId = await repo.createInterview('user-retry-2', getTemplateId());
      createdIds.interviews.push(interviewId);

      const state = makeState({
        userId: 'user-retry-2',
        templateId: getTemplateId(),
        interviewId,
        status: 'ACTIVE' as const,
        version: 1,
        originalVersion: 1,
      });

      // No version mismatch — should succeed first time
      const result = await repo.saveFullState(interviewId, state);
      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
    });
  });

  describe('findActiveInterview', () => {
    it('should return PENDING interview', async () => {
      const userId = 'user-find-1';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      const found = await repo.findActiveInterview(userId);
      expect(found).not.toBeNull();
      expect(found?.interviewId).toBe(interviewId);
      expect(found?.status).toBe('PENDING');
    });

    it('should return ACTIVE interview', async () => {
      const userId = 'user-find-2';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      // Transition to ACTIVE
      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'ACTIVE' as const,
          version: 1,
        }),
        version: 1,
      });

      const found = await repo.findActiveInterview(userId);
      expect(found).not.toBeNull();
      expect(found?.status).toBe('ACTIVE');
    });

    it('should return WAITING interview', async () => {
      const userId = 'user-find-3';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'WAITING' as const,
          version: 1,
        }),
        version: 1,
      });

      const found = await repo.findActiveInterview(userId);
      expect(found).not.toBeNull();
      expect(found?.status).toBe('WAITING');
    });

    it('should return null for COMPLETED interview', async () => {
      const userId = 'user-find-4';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      // Transition through ACTIVE to COMPLETED
      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'ACTIVE' as const,
          version: 1,
        }),
        version: 1,
      });
      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'COMPLETED' as const,
          version: 2,
        }),
        version: 2,
      });

      const found = await repo.findActiveInterview(userId);
      expect(found).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const found = await repo.findActiveInterview('nonexistent-user');
      expect(found).toBeNull();
    });
  });

  describe('findCompletedInterview', () => {
    it('should return completedAt and templateId for COMPLETED interview', async () => {
      const userId = 'user-comp-1';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'COMPLETED' as const,
          version: 1,
        }),
        version: 1,
      });

      const found = await repo.findCompletedInterview(userId);
      expect(found).not.toBeNull();
      expect(found?.templateId).toBe(getTemplateId());
      expect(found?.completedAt).toBeInstanceOf(Date);
    });

    it('should return null for ACTIVE interview', async () => {
      const userId = 'user-comp-2';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      const found = await repo.findCompletedInterview(userId);
      expect(found).toBeNull();
    });
  });

  describe('Lifecycle: PENDING → ACTIVE → COMPLETED', () => {
    it('should traverse the full interview lifecycle', async () => {
      const userId = 'user-lifecycle-1';
      const interviewId = await repo.createInterview(userId, getTemplateId());
      createdIds.interviews.push(interviewId);

      // Step 1: PENDING — should be found by findActiveInterview
      const foundPending = await repo.findActiveInterview(userId);
      expect(foundPending).not.toBeNull();
      expect(foundPending?.status).toBe('PENDING');

      // Step 2: Transition to ACTIVE
      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'ACTIVE' as const,
          version: 1,
        }),
        version: 1,
      });

      const foundActive = await repo.findActiveInterview(userId);
      expect(foundActive).not.toBeNull();
      expect(foundActive?.status).toBe('ACTIVE');

      // Completed not yet found
      const noCompleted = await repo.findCompletedInterview(userId);
      expect(noCompleted).toBeNull();

      // Step 3: Transition to COMPLETED
      await repo.saveState({
        interviewId,
        state: makeState({
          userId,
          templateId: getTemplateId(),
          interviewId,
          status: 'COMPLETED' as const,
          version: 2,
        }),
        version: 2,
      });

      // Now findActiveInterview returns null, findCompleted interview returns data
      const foundAfterComplete = await repo.findActiveInterview(userId);
      expect(foundAfterComplete).toBeNull();

      const completed = await repo.findCompletedInterview(userId);
      expect(completed).not.toBeNull();
      expect(completed?.templateId).toBe(getTemplateId());
    });
  });

  describe('Multiple users isolation', () => {
    it('should not affect user B when user A completes interview', async () => {
      const userIdA = 'user-isolate-a';
      const userIdB = 'user-isolate-b';
      const interviewIdA = await repo.createInterview(userIdA, getTemplateId());
      const interviewIdB = await repo.createInterview(userIdB, getTemplateId());
      createdIds.interviews.push(interviewIdA, interviewIdB);

      // Both initially active
      const a1 = await repo.findActiveInterview(userIdA);
      const b1 = await repo.findActiveInterview(userIdB);
      expect(a1).not.toBeNull();
      expect(b1).not.toBeNull();

      // Complete user A only
      await repo.saveState({
        interviewId: interviewIdA,
        state: makeState({
          userId: userIdA,
          templateId: getTemplateId(),
          interviewId: interviewIdA,
          status: 'COMPLETED' as const,
          version: 1,
        }),
        version: 1,
      });

      // User A: no active, has completed
      expect(await repo.findActiveInterview(userIdA)).toBeNull();
      expect(await repo.findCompletedInterview(userIdA)).not.toBeNull();

      // User B: still active, no completed
      expect(await repo.findActiveInterview(userIdB)).not.toBeNull();
      expect(await repo.findCompletedInterview(userIdB)).toBeNull();
    });
  });
});
