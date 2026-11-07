/**
 * Issue #232: the timeout nudge that could never fire, and the terminal state it needed.
 *
 * The original bug is worth restating because it shapes what these tests check.
 * `checkTimeoutNudge` worked, but its only caller was `processMessageInternal` — the
 * handler for an INBOUND message. Abandonment means no message arrives, so the check
 * could never run on the case it existed for, and `INTERVIEW_TIMEOUT_HOURS` /
 * `INTERVIEW_TIMEOUT_MAX_NUDGES` were dead configuration: all three stalled production
 * interviews had `nudgeCount = 0` after 18, 41 and 48 silent minutes, and one had been
 * abandoned on 2026-11-03 and was still ACTIVE when this was written.
 *
 * So the tests below drive `sweep()` — the path a cron job takes — never an inbound
 * message. A test that nudged via an inbound message would have passed against the bug.
 */
import { describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import {
  InterviewTimeoutService,
  nudgeMessage,
} from '../src/services/interview-timeout.service.js';

const HOUR = 60 * 60 * 1000;

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'user-1',
    templateId: 'template-1',
    interviewId: 'interview-1',
    status: 'ACTIVE',
    messages: [],
    currentQuestion: 4,
    followupCount: 0,
    maxFollowups: 5,
    nudgeCount: 0,
    responses: [],
    reportGenerated: false,
    version: 3,
    originalVersion: 3,
    pendingMessages: [],
    pendingResponses: [],
    ...overrides,
  };
}

/** A state whose last bot message is `hoursAgo` old. */
function stalledState(hoursAgo: number, overrides: Partial<InterviewState> = {}): InterviewState {
  return makeState({
    messages: [
      {
        role: 'user',
        content: '我的回答',
        timestamp: new Date(Date.now() - hoursAgo * HOUR - 60_000),
      },
      {
        role: 'assistant',
        content: '第 5 题：…',
        timestamp: new Date(Date.now() - hoursAgo * HOUR),
      },
    ],
    ...overrides,
  });
}

function build(options: {
  states: Record<string, InterviewState>;
  ids?: string[];
  total?: number;
  markSucceeds?: boolean;
}) {
  const saveState = vi.fn().mockResolvedValue(undefined);
  const markInterrupted = vi.fn().mockResolvedValue(options.markSucceeds ?? true);
  const repo = {
    findStalledInterviewIds: vi.fn().mockResolvedValue(options.ids ?? Object.keys(options.states)),
    findStateById: vi.fn(async (id: string) => options.states[id] ?? null),
    saveState,
    markInterrupted,
  };
  const send = vi.fn().mockResolvedValue(undefined);
  const service = new InterviewTimeoutService({
    repo: repo as never,
    send,
    totalQuestions: async () => options.total ?? 14,
  });
  return { service, repo, send, saveState, markInterrupted };
}

describe('InterviewTimeoutService (issue #232)', () => {
  it('nudges a stalled interview from a cron sweep, with no inbound message', async () => {
    const { service, send } = build({ states: { 'interview-1': stalledState(2) } });

    const result = await service.sweep();

    expect(result).toEqual({ scanned: 1, nudged: 1, interrupted: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('user-1');
  });

  it('persists the nudge count, so the cap is a real cap', async () => {
    const state = stalledState(2);
    const { service, saveState } = build({ states: { 'interview-1': state } });

    await service.sweep();

    expect(state.nudgeCount).toBe(1);
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState.mock.calls[0][0].state.nudgeCount).toBe(1);
  });

  it('does nothing to an interview that is still inside the idle window', async () => {
    const { service, send } = build({ states: { 'interview-1': stalledState(0.5) } });

    const result = await service.sweep();

    expect(result).toEqual({ scanned: 1, nudged: 0, interrupted: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it('trusts the transcript over the row timestamp when the bot spoke recently', async () => {
    // The repository listed this id because `updatedAt` was old, but the last bot
    // message is 5 minutes old — the conversation is not quiet, so nudging would be
    // wrong. The transcript is the authority.
    const state = stalledState(2, {
      messages: [
        {
          role: 'assistant',
          content: '刚发出的一题',
          timestamp: new Date(Date.now() - 5 * 60_000),
        },
      ],
    });
    const { service, send } = build({ states: { 'interview-1': state } });

    await service.sweep();

    expect(send).not.toHaveBeenCalled();
  });

  it('skips an interview whose status no longer owes a reply', async () => {
    const { service, send } = build({
      states: { 'interview-1': stalledState(3, { status: 'COMPLETED' }) },
    });

    const result = await service.sweep();

    expect(result.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips an interview with no timestamped assistant message to measure from', async () => {
    const state = makeState({ messages: [{ role: 'assistant', content: '无时间戳' }] });
    const { service, send } = build({ states: { 'interview-1': state } });

    expect((await service.sweep()).skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('closes the interview as INTERRUPTED once the nudges are exhausted', async () => {
    // The old code logged "will skip to next question" and did nothing. Skipping ahead
    // would fabricate an answer nobody gave, so the interview ends instead.
    const { service, send, markInterrupted } = build({
      states: { 'interview-1': stalledState(3, { nudgeCount: 3 }) },
    });

    const result = await service.sweep();

    expect(result).toEqual({ scanned: 1, nudged: 0, interrupted: 1, skipped: 0 });
    expect(markInterrupted).toHaveBeenCalledWith('interview-1', 3);
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves the interview alone when it resumed mid-decision', async () => {
    // markInterrupted is version-guarded: false means the interviewee answered while
    // this sweep was deciding, and their live turn must win.
    const { service, markInterrupted } = build({
      states: { 'interview-1': stalledState(3, { nudgeCount: 5 }) },
      markSucceeds: false,
    });

    await service.sweep();

    expect(markInterrupted).toHaveBeenCalled();
  });

  it('keeps sweeping after one interview throws', async () => {
    const good = stalledState(2);
    const repo = {
      findStalledInterviewIds: vi.fn().mockResolvedValue(['bad', 'good']),
      findStateById: vi.fn(async (id: string) => {
        if (id === 'bad') throw new Error('db exploded');
        return good;
      }),
      saveState: vi.fn().mockResolvedValue(undefined),
      markInterrupted: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);
    const service = new InterviewTimeoutService({
      repo: repo as never,
      send,
      totalQuestions: async () => 14,
    });

    const result = await service.sweep();

    // One bad row must not block every other stalled conversation, every hour.
    expect(result).toEqual({ scanned: 2, nudged: 1, interrupted: 0, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports an empty sweep instead of throwing when the listing fails', async () => {
    const repo = {
      findStalledInterviewIds: vi.fn().mockRejectedValue(new Error('db down')),
      findStateById: vi.fn(),
      saveState: vi.fn(),
      markInterrupted: vi.fn(),
    };
    const service = new InterviewTimeoutService({
      repo: repo as never,
      send: vi.fn(),
      totalQuestions: async () => 14,
    });

    // An unhandled rejection in a cron callback kills the timer for every later hour.
    await expect(service.sweep()).resolves.toEqual({
      scanned: 0,
      nudged: 0,
      interrupted: 0,
      skipped: 0,
    });
  });

  it('honours the configured idle window', async () => {
    const state = stalledState(2);
    const repo = {
      findStalledInterviewIds: vi.fn().mockResolvedValue(['interview-1']),
      findStateById: vi.fn(async () => state),
      saveState: vi.fn().mockResolvedValue(undefined),
      markInterrupted: vi.fn().mockResolvedValue(true),
    };
    const send = vi.fn().mockResolvedValue(undefined);
    // A 3-hour window means a 2-hour silence is not yet stalled.
    const service = new InterviewTimeoutService(
      { repo: repo as never, send, totalQuestions: async () => 14 },
      { timeoutHours: 3 }
    );

    expect((await service.sweep()).nudged).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('nudgeMessage (issue #232)', () => {
  it('tells the interviewee where they are and how much is left', () => {
    const msg = nudgeMessage(4, 14);
    expect(msg).toContain('第 5/14 题');
    expect(msg).toContain('还剩 9 题');
  });

  it('offers an explicit way out, since silence is not handled by the graph', () => {
    expect(nudgeMessage(4, 14)).toContain('结束');
  });

  it('never reports a position past the total', () => {
    expect(nudgeMessage(14, 14)).toContain('第 14/14 题');
    expect(nudgeMessage(14, 14)).not.toContain('15/14');
  });

  it('calls the final question the final question rather than leaving 0 left', () => {
    expect(nudgeMessage(13, 14)).toContain('这是最后一题');
    expect(nudgeMessage(13, 14)).not.toContain('还剩 0 题');
  });

  it('degrades to generic copy when the question count is unknown', () => {
    expect(nudgeMessage(4, 0)).not.toContain('第');
    expect(nudgeMessage(4, 0)).toContain('访谈还在进行中');
  });
});
