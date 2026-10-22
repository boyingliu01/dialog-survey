import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { StreamMessageService } from '../src/services/stream-message.service.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';

/**
 * Branch-level coverage for the parts of `StreamMessageService` that the happy
 * path in `stream-message-service.test.ts` never reaches.
 *
 * Gate M put this file at 31% with 134 surviving mutants, most of them in the
 * guards around cooldown, dedup, timeout nudges and user-name resolution. Each
 * test here pins one branch to its observable effect (the reply text, the number
 * of repo writes, the cache behaviour) rather than only its return shape, so a
 * mutant that flips the guard produces a different observable.
 */

const mockRunInterviewGraph = vi.fn();

vi.mock('../src/core/graph.js', () => ({
  runInterviewGraph: (...args: unknown[]) => mockRunInterviewGraph(...args),
}));

// Spy on the logger so the "retries exhausted" warnings become observable. An
// unassertable log line is exactly what a surviving StringLiteral mutant looks
// like: the branch runs, nothing changes that a test can see.
const mockError = vi.fn();
const mockInfo = vi.fn();
vi.mock('../src/utils/logger.js', () => ({
  error: (...args: unknown[]) => mockError(...args),
  info: (...args: unknown[]) => mockInfo(...args),
  warn: (...args: unknown[]) => mockInfo(...args),
  debug: () => undefined,
}));

vi.mock('../src/repositories/interview-state.repository.js', () => ({
  InterviewStateRepository: vi.fn(),
}));

// Hoisting-safe handle on the mocked template table: the factory below reads
// this at call time, so a test can set the rows before triggering a lookup.
const mockTemplateRows: { rows: Array<{ id: string; status: string }> } = { rows: [] };

vi.mock('../src/repositories/template.repository.js', () => {
  const MockClass = class {
    findAll = vi.fn(async () => mockTemplateRows.rows);
    findById = vi.fn().mockResolvedValue(null);
  };
  return { TemplateRepository: MockClass };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

function state(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    userId: 'u1',
    interviewId: 'iv-1',
    templateId: 'tpl-1',
    status: 'ACTIVE',
    messages: [],
    currentQuestion: 0,
    followupCount: 0,
    maxFollowups: 1,
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

function envelope(data: Record<string, unknown>, messageId = 'msg-1'): StreamMessage {
  return {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: { topic: '/v1.0/im/bot/messages/get', messageId, time: '2024-01-01T00:00:00Z' },
    data: JSON.stringify(data),
  } as StreamMessage;
}

describe('StreamMessageService branch coverage', () => {
  let service: StreamMessageService;
  let repo: {
    findActiveInterview: ReturnType<typeof vi.fn>;
    findCompletedInterview: ReturnType<typeof vi.fn>;
    createInterview: ReturnType<typeof vi.fn>;
    loadFullState: ReturnType<typeof vi.fn>;
    saveFullState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, text: async () => 'ok' });
    repo = {
      findActiveInterview: vi.fn().mockResolvedValue(null),
      findCompletedInterview: vi.fn().mockResolvedValue(null),
      createInterview: vi.fn().mockResolvedValue('iv-new'),
      loadFullState: vi.fn(),
      saveFullState: vi.fn().mockResolvedValue(undefined),
    };
    service = new StreamMessageService(repo as unknown as InterviewStateRepository);
    mockRunInterviewGraph.mockImplementation(async (incoming: Record<string, unknown>) => ({
      response: 'bot says hi',
      nextState: { ...incoming, status: 'ACTIVE', pendingMessages: [], pendingResponses: [] },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('cooldown restart guard', () => {
    it('blocks the restart inside the window and states the remaining minutes', async () => {
      const completedAt = new Date(Date.now() - 5 * 60 * 1000);
      repo.findCompletedInterview.mockResolvedValue({ completedAt });

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );

      expect(result.success).toBe(true);
      // 30 min cooldown minus 5 elapsed leaves ~25 minutes.
      expect(result.response).toContain('您的访谈已经完成');
      expect(result.response).toContain('25 分钟');
      // A blocked restart must not create a new interview.
      expect(repo.createInterview).not.toHaveBeenCalled();
      expect(mockRunInterviewGraph).not.toHaveBeenCalled();
    });

    it('honours INTERVIEW_COOLDOWN_MINUTES when computing the remaining time', async () => {
      vi.stubEnv('INTERVIEW_COOLDOWN_MINUTES', '120');
      // 1 minute elapsed of a 120-minute window leaves 119.
      repo.findCompletedInterview.mockResolvedValue({
        completedAt: new Date(Date.now() - 60 * 1000),
      });

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );
      expect(result.response).toContain('119 分钟');
    });

    it('falls back to the default when the cooldown env var is not a positive number', async () => {
      vi.stubEnv('INTERVIEW_COOLDOWN_MINUTES', 'not-a-number');
      repo.findCompletedInterview.mockResolvedValue({
        completedAt: new Date(Date.now() - 29 * 60 * 1000),
      });

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );
      // 30-minute default still blocks, leaving ~1 minute.
      expect(result.response).toContain('您的访谈已经完成');
    });

    it('treats a zero cooldown as the default rather than an immediate reopen', async () => {
      vi.stubEnv('INTERVIEW_COOLDOWN_MINUTES', '0');
      repo.findCompletedInterview.mockResolvedValue({ completedAt: new Date() });

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );
      expect(result.response).toContain('您的访谈已经完成');
    });

    it('sends the cooldown reply over the webhook when one is supplied', async () => {
      repo.findCompletedInterview.mockResolvedValue({ completedAt: new Date() });

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'hi' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(mockFetch.mock.calls[0][1].body)) as {
        text: { content: string };
      };
      expect(body.text.content).toContain('您的访谈已经完成');
    });

    it('does not call the webhook when the cooldown blocks a message with no webhook', async () => {
      repo.findCompletedInterview.mockResolvedValue({ completedAt: new Date() });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('dedup cache', () => {
    it('rejects a second message with the same messageId', async () => {
      const first = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }, 'dup-1'),
        0
      );
      expect(first.success).toBe(true);
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(1);

      const second = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }, 'dup-1'),
        0
      );
      expect(second.success).toBe(false);
      expect(second.error).toBe('Duplicate message');
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(1);
    });

    it('lets distinct messageIds through', async () => {
      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'a' } }, 'dup-a'),
        0
      );
      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'b' } }, 'dup-b'),
        0
      );
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(2);
    });

    it('evicts the oldest entry once the cache is over its limit', async () => {
      // DEDUP_CACHE_SIZE is 1000; the 1001st distinct id must evict the first.
      const total = 1001;
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < total; i++) {
        promises.push(
          service.processStreamMessage(
            envelope({ senderStaffId: 'u1', text: { content: `m${i}` } }, `evict-${i}`),
            0
          )
        );
      }
      await Promise.all(promises);

      const replays = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'again' } }, 'evict-0'),
        0
      );
      // 'evict-0' was oldest and should have been dropped, so it runs again.
      expect(replays.success).toBe(true);
    });
  });

  describe('empty and malformed content guards', () => {
    it('rejects whitespace-only content', async () => {
      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: '   ' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty message content');
      expect(mockRunInterviewGraph).not.toHaveBeenCalled();
    });

    it('rejects a message with no content field', async () => {
      const result = await service.processStreamMessage(envelope({ senderStaffId: 'u1' }), 0);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });

    it('rejects unparseable data', async () => {
      const broken = {
        headers: { messageId: 'm' },
        data: 'not json',
      } as unknown as StreamMessage;
      const result = await service.processStreamMessage(broken, 0);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid message format');
    });
  });

  describe('timeout nudge', () => {
    it('stays silent when the last bot message is younger than the timeout', async () => {
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '2');
      repo.findActiveInterview.mockResolvedValue(
        state({
          messages: [{ role: 'assistant', content: 'q', timestamp: new Date().toISOString() }],
        })
      );

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends a nudge once the timeout has passed and counts it', async () => {
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const activeState = state({
        messages: [{ role: 'assistant', content: 'q', timestamp: old }],
      });
      repo.findActiveInterview.mockResolvedValue(activeState);
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );

      // The nudge went out on the same webhook as the normal reply.
      const contents = mockFetch.mock.calls.map(
        (c) => (JSON.parse(String(c[1].body)) as { text: { content: string } }).text.content
      );
      expect(contents.some((c) => c.includes('您的访谈还在进行中'))).toBe(true);
      // The nudge counter advanced and was persisted with the state.
      expect(saved.some((s) => s['nudgeCount'] === 1)).toBe(true);
    });

    it('does not nudge beyond INTERVIEW_TIMEOUT_MAX_NUDGES', async () => {
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      vi.stubEnv('INTERVIEW_TIMEOUT_MAX_NUDGES', '2');
      const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      repo.findActiveInterview.mockResolvedValue(
        state({
          nudgeCount: 2,
          messages: [{ role: 'assistant', content: 'q', timestamp: old }],
        })
      );

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );

      const contents = mockFetch.mock.calls.map(
        (c) => (JSON.parse(String(c[1].body)) as { text: { content: string } }).text.content
      );
      expect(contents.some((c) => c.includes('您的访谈还在进行中'))).toBe(false);
    });

    it('ignores interviews that are neither ACTIVE nor WAITING', async () => {
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      repo.findActiveInterview.mockResolvedValue(
        state({
          status: 'PROCESSING',
          messages: [{ role: 'assistant', content: 'q', timestamp: old }],
        })
      );

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );
      const contents = mockFetch.mock.calls.map(
        (c) => (JSON.parse(String(c[1].body)) as { text: { content: string } }).text.content
      );
      expect(contents.some((c) => c.includes('您的访谈还在进行中'))).toBe(false);
    });

    it('skips the nudge when the last assistant message carries no timestamp', async () => {
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      repo.findActiveInterview.mockResolvedValue(
        state({ messages: [{ role: 'assistant', content: 'q' }] })
      );

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );
      const contents = mockFetch.mock.calls.map(
        (c) => (JSON.parse(String(c[1].body)) as { text: { content: string } }).text.content
      );
      expect(contents.some((c) => c.includes('您的访谈还在进行中'))).toBe(false);
    });
  });

  describe('persistence failure handling', () => {
    it('retries once on a version conflict and then succeeds', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      // Call 1 is the pre-LLM save, call 2 is the post-graph save that hits the
      // conflict, call 3 is the retry's save, which wins.
      repo.saveFullState
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Version conflict detected'))
        .mockResolvedValue(undefined);
      repo.loadFullState.mockResolvedValue(state({ version: 2 }));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );

      expect(result.success).toBe(true);
      expect(repo.loadFullState).toHaveBeenCalledTimes(1);
      // The graph ran twice: the first attempt and the retry.
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(2);
      expect(repo.saveFullState).toHaveBeenCalledTimes(3);
    });

    it('returns the error when the version conflict persists', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      // The pre-LLM save succeeds; every save after it conflicts, so the retry
      // exhausts MAX_RETRIES.
      repo.saveFullState
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error('Version conflict detected'));
      repo.loadFullState.mockResolvedValue(state({ version: 2 }));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });

    it('does not retry a non-conflict persistence error', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      // The pre-LLM save succeeds; the post-graph save fails for an unrelated
      // reason, which must not trigger the conflict retry.
      repo.saveFullState.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('disk full'));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('disk full');
      expect(repo.loadFullState).not.toHaveBeenCalled();
      // Only the first attempt ran the graph; no retry happened.
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(1);
    });

    it('reports a failure when the pre-LLM save fails', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      repo.saveFullState.mockRejectedValueOnce(new Error('pre-llm boom'));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('pre-llm boom');
      expect(mockRunInterviewGraph).not.toHaveBeenCalled();
    });
  });

  describe('completed interviews', () => {
    it('keeps the COMPLETED status the graph returned instead of forcing ACTIVE', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      mockRunInterviewGraph.mockImplementation(async (incoming: Record<string, unknown>) => ({
        response: 'thanks',
        nextState: {
          ...incoming,
          status: 'COMPLETED',
          pendingMessages: [],
          pendingResponses: [],
        },
      }));
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(saved.some((s) => s['status'] === 'COMPLETED')).toBe(true);
    });

    it('forces ACTIVE when the graph did not finish the interview', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      // The PROCESSING write comes first, then the ACTIVE write.
      expect(saved[0]['status']).toBe('PROCESSING');
      expect(saved[saved.length - 1]['status']).toBe('ACTIVE');
    });
  });

  describe('user name backfill', () => {
    function prismaStub(inviteeData: unknown, planId: string | null = 'plan-1') {
      return {
        interview: { findFirst: vi.fn().mockResolvedValue({ planId }) },
        interviewPlan: { findUnique: vi.fn().mockResolvedValue({ inviteeData }) },
      };
    }

    it('fills the user name from the plan invitee data', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      const prisma = prismaStub([
        { userId: 'other', name: '别人' },
        { userId: 'u1', name: '张三' },
      ]);
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0,
        prisma as never
      );

      expect(saved.some((s) => s['userName'] === '张三')).toBe(true);
    });

    it('leaves the name unset when the interview has no plan', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      const prisma = prismaStub(null, null);
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0,
        prisma as never
      );
      expect(saved.every((s) => s['userName'] === undefined)).toBe(true);
    });

    it('swallows a lookup failure so the conversation still proceeds', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      const prisma = {
        interview: { findFirst: vi.fn().mockRejectedValue(new Error('db down')) },
        interviewPlan: { findUnique: vi.fn() },
      };

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0,
        prisma as never
      );
      expect(result.success).toBe(true);
    });
  });

  describe('default template resolution', () => {
    beforeEach(() => {
      mockTemplateRows.rows = [];
      repo.findActiveInterview.mockResolvedValue(null);
    });

    afterEach(() => {
      mockTemplateRows.rows = [];
    });

    it('prefers a PUBLISHED template over an earlier draft', async () => {
      mockTemplateRows.rows = [
        { id: 'draft-1', status: 'DRAFT' },
        { id: 'pub-1', status: 'PUBLISHED' },
      ];

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0,
        {} as never
      );
      expect(repo.createInterview).toHaveBeenCalledWith('u1', 'pub-1');
    });

    it('falls back to the first template when none is published', async () => {
      mockTemplateRows.rows = [
        { id: 'draft-1', status: 'DRAFT' },
        { id: 'draft-2', status: 'DRAFT' },
      ];

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0,
        {} as never
      );
      expect(repo.createInterview).toHaveBeenCalledWith('u1', 'draft-1');
    });

    it('uses the placeholder template id when the table is empty', async () => {
      mockTemplateRows.rows = [];

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0,
        {} as never
      );
      expect(repo.createInterview).toHaveBeenCalledWith('u1', 'test-template');
    });

    it('uses the placeholder template id when no prisma client is supplied', async () => {
      // Without prisma the repository is never consulted at all.
      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'hi' } }),
        0
      );
      expect(repo.createInterview).toHaveBeenCalledWith('u1', 'test-template');
    });
  });

  describe('version-conflict retry path', () => {
    // These drive processStreamMessageWithState, the private retry loop that the
    // conflict path re-enters. Reaching it needs a conflict whose reload succeeds,
    // which leaves most of its guards uncovered otherwise.
    const conflict = new Error('Version conflict on interview state');

    it('exhausts retries and reports the last conflict', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      // The retry chain visits processMessageInternal (pre-LLM save, then
      // post-graph save) and processStreamMessageWithState (a single post-graph
      // save). Only the pre-LLM saves may succeed — a failing one returns early
      // and never reaches the retry chain — so this replays the exact sequence:
      //   attempt 0: pre ok, post conflict
      //   retry   1: post conflict (withState)
      //   retry   2: pre ok, post conflict
      //   retry   3: post conflict, retries exhausted
      const outcomes = [true, false, false, true, false, false];
      let writes = 0;
      repo.saveFullState.mockImplementation(async () => {
        const ok = outcomes[writes] ?? false;
        writes += 1;
        if (!ok) throw conflict;
        return undefined;
      });
      repo.loadFullState.mockImplementation(async () => state({ version: 9 }));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
      // Running out of retries is loud: it is the point where pending data can be
      // lost, so the warning must name the interview and how much data was queued.
      const exhausted = mockError.mock.calls.filter((c) =>
        String(c[0]).includes('retries exhausted')
      );
      expect(exhausted.length).toBeGreaterThan(0);
      expect(exhausted[0][1]).toMatchObject({ interviewId: 'iv-1' });
      expect(exhausted[0][1]).toHaveProperty('pendingMessagesCount');
      expect(exhausted[0][1]).toHaveProperty('pendingResponsesCount');
    });

    it('stops retrying when the reload finds no state', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      repo.saveFullState.mockResolvedValueOnce(undefined).mockRejectedValue(conflict);
      // The interview vanished between writes, so there is nothing to retry on.
      repo.loadFullState.mockResolvedValue(null);

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(repo.loadFullState).toHaveBeenCalledTimes(1);
      // Only the first attempt reached the graph; the retry bailed out.
      expect(mockRunInterviewGraph).toHaveBeenCalledTimes(1);
    });

    it('keeps a COMPLETED status returned during the retry', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      repo.saveFullState
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(conflict)
        .mockResolvedValue(undefined);
      repo.loadFullState.mockResolvedValue(state({ version: 2 }));
      mockRunInterviewGraph
        .mockImplementationOnce(async (incoming: Record<string, unknown>) => ({
          response: 'first',
          nextState: { ...incoming, status: 'ACTIVE', pendingMessages: [], pendingResponses: [] },
        }))
        .mockImplementation(async (incoming: Record<string, unknown>) => ({
          response: 'retried',
          nextState: {
            ...incoming,
            status: 'COMPLETED',
            pendingMessages: [],
            pendingResponses: [],
          },
        }));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(true);
      expect(result.response).toBe('retried');
    });

    it('forces ACTIVE when the retried graph leaves the interview open', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      repo.loadFullState.mockResolvedValue(state({ version: 2 }));
      mockRunInterviewGraph.mockImplementation(async (incoming: Record<string, unknown>) => ({
        response: 'still open',
        nextState: { ...incoming, status: 'WAITING', pendingMessages: [], pendingResponses: [] },
      }));
      const saved: Array<Record<string, unknown>> = [];
      // Only the second write conflicts, so the first attempt runs, the retry
      // reloads, and the retry's write lands for real.
      let writes = 0;
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        writes += 1;
        if (writes === 2) throw conflict;
        saved.push({ ...s });
      });

      await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      // The final persisted status is ACTIVE, not the WAITING the graph returned.
      expect(saved[saved.length - 1]['status']).toBe('ACTIVE');
    });

    it('reports a non-conflict error raised on the retry path', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      let writes = 0;
      repo.saveFullState.mockImplementation(async () => {
        writes += 1;
        if (writes === 2) throw conflict;
        if (writes === 3) throw new Error('retry write exploded');
        return undefined;
      });
      repo.loadFullState.mockResolvedValue(state({ version: 2 }));

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('retry write exploded');
    });
  });

  describe('silent resume from PROCESSING', () => {
    it('resumes an interview left in PROCESSING and promotes it to ACTIVE', async () => {
      repo.findActiveInterview.mockResolvedValue(state({ status: 'PROCESSING' }));
      const saved: Array<Record<string, unknown>> = [];
      repo.saveFullState.mockImplementation(async (_id: string, s: Record<string, unknown>) => {
        saved.push({ ...s });
      });

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );

      expect(result.success).toBe(true);
      // PROCESSING is written first (from the interrupted status), then ACTIVE.
      expect(saved[0]['status']).toBe('PROCESSING');
      expect(saved[saved.length - 1]['status']).toBe('ACTIVE');
    });
  });

  describe('webhook delivery', () => {
    it('sends the graph reply to the webhook and still reports success when it fails', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      // A failing webhook must not turn a persisted turn into a failure.
      mockFetch.mockRejectedValue(new Error('network down'));

      const result = await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
        0
      );
      expect(result.success).toBe(true);
      expect(result.response).toBe('bot says hi');
    });

    it('rejects a webhook whose host is not on the allowlist', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      mockFetch.mockClear();

      await service.processStreamMessage(
        envelope({
          senderStaffId: 'u1',
          text: { content: 'answer' },
          sessionWebhook: 'https://evil.example.com/hook',
        }),
        0
      );
      // The allowlist drops the URL before any request is made.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not attempt delivery without a webhook', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      mockFetch.mockClear();

      const result = await service.processStreamMessage(
        envelope({ senderStaffId: 'u1', text: { content: 'answer' } }),
        0
      );
      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('serialized processing per user', () => {
    it('runs concurrent messages for the same user one after another', async () => {
      repo.findActiveInterview.mockResolvedValue(state());
      const order: string[] = [];
      mockRunInterviewGraph.mockImplementation(
        async (incoming: Record<string, unknown>, input: Record<string, unknown>) => {
          const tag = String(input['content']);
          order.push(`start:${tag}`);
          await new Promise((r) => setTimeout(r, 5));
          order.push(`end:${tag}`);
          return {
            response: 'ok',
            nextState: { ...incoming, status: 'ACTIVE', pendingMessages: [], pendingResponses: [] },
          };
        }
      );

      await Promise.all([
        service.processStreamMessage(
          envelope({ senderStaffId: 'same-user', text: { content: 'a' } }, 'lock-a'),
          0
        ),
        service.processStreamMessage(
          envelope({ senderStaffId: 'same-user', text: { content: 'b' } }, 'lock-b'),
          0
        ),
      ]);

      // The second message must not interleave with the first: whichever runs
      // first, its start and end are adjacent.
      expect(order).toHaveLength(4);
      const [first, second, third, fourth] = order;
      expect(first.startsWith('start:')).toBe(true);
      expect(second).toBe(first.replace('start:', 'end:'));
      expect(third.startsWith('start:')).toBe(true);
      expect(fourth).toBe(third.replace('start:', 'end:'));
      // Both messages still got processed.
      expect(new Set([first.replace('start:', ''), third.replace('start:', '')])).toEqual(
        new Set(['a', 'b'])
      );
    });
  });
});
