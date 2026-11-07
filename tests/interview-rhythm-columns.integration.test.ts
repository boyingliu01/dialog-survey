/**
 * Issue #233: the three interview-rhythm columns that were declared but never written.
 *
 * These drive the real Prisma schema against PGlite on purpose. Each of the three
 * defects was invisible without a database: `followupDepth` had a `@default(0)` that
 * silently absorbed the omitted field, `startedAt`/`completedAt` were nullable so a
 * NULL was a valid write, and `findCompletedInterview` returned a plausible-looking
 * date — the wrong one. A unit test with a mocked Prisma would assert the mock.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { TestDatabase } from './helpers/test-db.js';

describe('InterviewStateRepository — rhythm columns (issue #233)', () => {
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
        name: 'Issue 233 Template',
        content: JSON.stringify({ invitationPrompt: 'Hello', questions: ['Q1', 'Q2'] }),
        status: 'DRAFT',
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    createdIds.templates.push(template.id);
  });

  afterEach(async () => {
    await testDb.cleanup({ interviews: createdIds.interviews, templates: createdIds.templates });
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function freshInterview(userId: string): Promise<{ id: string; state: InterviewState }> {
    const id = await repo.createInterview(userId, createdIds.templates[0]);
    createdIds.interviews.push(id);
    const state = await repo.loadFullState(id, userId);
    if (!state) throw new Error('interview not created');
    return { id, state };
  }

  it('persists a non-zero followupDepth, so follow-up rounds are countable', async () => {
    const userId = 'user-depth';
    const { id, state } = await freshInterview(userId);

    state.pendingResponses = [
      { questionId: 'q0', content: '第一轮追问的回答', isFollowup: true, followupDepth: 1 },
      { questionId: 'q0', content: '第二轮追问的回答', isFollowup: true, followupDepth: 2 },
      { questionId: 'q1', content: '本题本身的回答', isFollowup: false, followupDepth: 0 },
    ];
    await repo.saveFullState(id, state);

    const rows = await testDb.getPrisma().response.findMany({
      where: { interviewId: id },
      orderBy: { createdAt: 'asc' },
    });
    // The bug: `followupDepth` was omitted from the createMany payload, so the
    // column's @default(0) absorbed it and every row read depth=0 forever.
    const byDepth = rows.map((r) => r.followupDepth).sort((a, b) => a - b);
    expect(byDepth).toEqual([0, 1, 2]);
  });

  it('defaults a missing followupDepth to 0 rather than failing the write', async () => {
    const userId = 'user-depth-legacy';
    const { id, state } = await freshInterview(userId);

    // States persisted before the field existed carry no key at all.
    state.pendingResponses = [
      { questionId: 'q0', content: '老数据的回答', isFollowup: false } as never,
    ];
    await repo.saveFullState(id, state);

    const row = await testDb.getPrisma().response.findFirst({ where: { interviewId: id } });
    expect(row).not.toBeNull();
    expect(row?.followupDepth).toBe(0);
  });

  it('records startedAt on the first write and never moves it afterwards', async () => {
    const userId = 'user-started';
    const { id, state } = await freshInterview(userId);

    const before = await testDb.getPrisma().interview.findUnique({ where: { id } });
    expect(before?.startedAt).toBeNull(); // nothing had written it before #233

    await repo.saveFullState(id, state);
    const afterFirst = await testDb.getPrisma().interview.findUnique({ where: { id } });
    const startedAt = afterFirst?.startedAt;
    expect(startedAt).toBeInstanceOf(Date);

    // A resend or any later turn must not redefine when the interview began.
    await repo.saveFullState(id, state);
    const afterSecond = await testDb.getPrisma().interview.findUnique({ where: { id } });
    expect(afterSecond?.startedAt?.getTime()).toBe(startedAt?.getTime());
  });

  it('records completedAt when the interview reaches a terminal status', async () => {
    const userId = 'user-completed';
    const { id, state } = await freshInterview(userId);

    await repo.saveFullState(id, state);
    const active = await testDb.getPrisma().interview.findUnique({ where: { id } });
    expect(active?.completedAt).toBeNull(); // still running

    state.status = 'COMPLETED';
    await repo.saveFullState(id, state);

    const done = await testDb.getPrisma().interview.findUnique({ where: { id } });
    expect(done?.completedAt).toBeInstanceOf(Date);
    // The admin page's "average interview duration" is derived from these two, and
    // it read 0 for all 19 completed interviews in production.
    expect(done?.completedAt?.getTime()).toBeGreaterThanOrEqual(done?.startedAt?.getTime() ?? 0);
  });

  it('prefers the real completedAt over updatedAt for the cooldown window', async () => {
    const userId = 'user-cooldown';
    const { id, state } = await freshInterview(userId);
    await repo.saveFullState(id, state);
    state.status = 'COMPLETED';
    await repo.saveFullState(id, state);

    const completed = await testDb.getPrisma().interview.findUnique({ where: { id } });
    // Simulate the measured case: the conversation continued AFTER the interview
    // finished (interview 18811eb7 kept going at 18:14), so updatedAt drifts ahead.
    const drifted = new Date((completed?.completedAt?.getTime() ?? 0) + 60 * 60 * 1000);
    await testDb.getPrisma().interview.update({
      where: { id },
      data: { updatedAt: drifted },
    });

    const found = await repo.findCompletedInterview(userId);
    expect(found).not.toBeNull();
    // It must report the completion instant, not the later message activity.
    expect(found?.completedAt.getTime()).toBe(completed?.completedAt?.getTime());
    expect(found?.completedAt.getTime()).not.toBe(drifted.getTime());
  });

  it('falls back to updatedAt for interviews completed before the fix', async () => {
    const userId = 'user-legacy-cooldown';
    const { id, state } = await freshInterview(userId);
    await repo.saveFullState(id, state);
    state.status = 'COMPLETED';
    await repo.saveFullState(id, state);

    // Pre-#233 rows have a NULL completedAt; without the fallback the cooldown would
    // silently stop applying to every interview that already exists.
    await testDb.getPrisma().interview.update({ where: { id }, data: { completedAt: null } });

    const found = await repo.findCompletedInterview(userId);
    expect(found).not.toBeNull();
    expect(found?.completedAt).toBeInstanceOf(Date);
  });
});
