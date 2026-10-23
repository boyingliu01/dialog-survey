import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';

/**
 * @test REQ-155-GRAPH
 * @intent 覆盖 runInterviewGraph 的全部分支：首轮判定、状态守卫、空消息守卫、完成时触发异步分析
 * @covers firstTurn 选项与 PENDING 回退的优先级、不可处理状态直接返回、空白内容拒绝、shouldContinue=false 调起 AnalysisService、异步分析失败只记日志
 *
 * Gate M had graph.ts at 57.1% — just under the bar. The survivors were all in
 * the edges rather than the happy path: whether `firstTurn` really wins over the
 * status, whether a blank message is rejected before reaching the node, and
 * whether completing the interview actually schedules the analysis. That last
 * one is fire-and-forget via setImmediate, so nothing asserted it ran.
 */

const mockInfo = vi.fn();
const mockError = vi.fn();
const mockAnalyze = vi.fn();
const mockPlanning = vi.fn();
const mockInterviewing = vi.fn();

vi.mock('../src/utils/logger.js', () => ({
  info: (...a: unknown[]) => mockInfo(...a),
  error: (...a: unknown[]) => mockError(...a),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../src/services/analysis.service.js', () => ({
  // A real class, not `vi.fn().mockImplementation()`: under Vitest 4 the latter
  // is not constructible through `new`, so the callback silently never ran and
  // every analysis assertion failed for the mock's reasons rather than the code's.
  AnalysisService: class {
    analyzeInterview(...args: unknown[]): unknown {
      return mockAnalyze(...args);
    }
  },
}));

vi.mock('../src/utils/db.js', () => ({ getDb: vi.fn(() => ({})) }));

vi.mock('../src/core/nodes/planning.js', () => ({
  planningNode: (...a: unknown[]) => mockPlanning(...a),
}));

vi.mock('../src/core/nodes/interviewing.js', () => ({
  interviewingNode: (...a: unknown[]) => mockInterviewing(...a),
}));

const { runInterviewGraph } = await import('../src/core/graph.js');
const { DEFAULT_CLOSING_MESSAGE } = await import('../src/core/types/index.js');

function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'u1',
    interviewId: 'iv-1',
    templateId: 'tpl-1',
    status: 'ACTIVE',
    messages: [],
    currentQuestion: 0,
    followupCount: 0,
    maxFollowups: 2,
    responses: [],
    reportGenerated: false,
    version: 1,
    originalVersion: 1,
    pendingMessages: [],
    pendingResponses: [],
    nudgeCount: 0,
    ...overrides,
  } as InterviewState;
}

/**
 * Wait for the fire-and-forget analysis. Polling beats a fixed number of
 * `setImmediate` turns because the call may land after any microtask drain.
 */
async function waitForCall(fn: () => void): Promise<void> {
  await vi.waitFor(fn, { timeout: 2000, interval: 5 });
}

describe('runInterviewGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanning.mockResolvedValue({ response: '开场白', status: 'ACTIVE' });
    mockInterviewing.mockResolvedValue({ response: '收到', shouldContinue: true });
    mockAnalyze.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('first turn detection', () => {
    it('runs the planning node when the options say first turn', async () => {
      const result = await runInterviewGraph(
        state({ status: 'PROCESSING' }),
        { userId: 'u1', content: 'hi' },
        undefined,
        {
          firstTurn: true,
        }
      );

      expect(mockPlanning).toHaveBeenCalledTimes(1);
      expect(mockInterviewing).not.toHaveBeenCalled();
      expect(result.response).toBe('开场白');
    });

    it('treats a PENDING state as the first turn when no option is given', async () => {
      await runInterviewGraph(state({ status: 'PENDING' }), { userId: 'u1', content: 'hi' });

      expect(mockPlanning).toHaveBeenCalledTimes(1);
    });

    it('lets the option override a PENDING status', async () => {
      // The authoritative signal must win: a caller that already decided this is
      // not the first turn must not be second-guessed by the stored status.
      await runInterviewGraph(
        state({ status: 'PENDING' }),
        { userId: 'u1', content: 'hi' },
        undefined,
        {
          firstTurn: false,
        }
      );

      expect(mockPlanning).not.toHaveBeenCalled();
    });

    it('falls back to the closing message when planning returns no response', async () => {
      mockPlanning.mockResolvedValue({ status: 'ACTIVE' });

      const result = await runInterviewGraph(state({ status: 'PENDING' }), {
        userId: 'u1',
        content: 'hi',
      });

      expect(result.response).toBe(DEFAULT_CLOSING_MESSAGE);
    });

    it('does not schedule analysis on the first turn', async () => {
      await runInterviewGraph(state({ status: 'PENDING' }), { userId: 'u1', content: 'hi' });
      await new Promise((r) => setImmediate(r));

      expect(mockAnalyze).not.toHaveBeenCalled();
    });
  });

  describe('status guard', () => {
    it.each(['COMPLETED', 'CANCELLED'])('returns the closing message for %s', async (status) => {
      const initial = state({ status: status as InterviewState['status'] });

      const result = await runInterviewGraph(initial, { userId: 'u1', content: 'hi' });

      expect(result.response).toBe(DEFAULT_CLOSING_MESSAGE);
      expect(result.nextState).toBe(initial);
      expect(mockInterviewing).not.toHaveBeenCalled();
    });

    it.each(['ACTIVE', 'WAITING', 'PROCESSING'])('processes input for %s', async (status) => {
      await runInterviewGraph(state({ status: status as InterviewState['status'] }), {
        userId: 'u1',
        content: 'hi',
      });

      expect(mockInterviewing).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty message guard', () => {
    it.each(['', '   ', '\n\t'])('rejects the blank content %j', async (content) => {
      const result = await runInterviewGraph(state(), { userId: 'u1', content });

      expect(result.response).toBe('请发送消息开始访谈。');
      expect(mockInterviewing).not.toHaveBeenCalled();
    });

    it('passes a message with surrounding whitespace through', async () => {
      await runInterviewGraph(state(), { userId: 'u1', content: '  有内容  ' });

      expect(mockInterviewing).toHaveBeenCalledTimes(1);
    });
  });

  describe('completion', () => {
    it('returns the node response and merged state', async () => {
      mockInterviewing.mockResolvedValue({
        response: '聊完了',
        shouldContinue: false,
        status: 'COMPLETED',
      });

      const result = await runInterviewGraph(state(), { userId: 'u1', content: 'end' });

      expect(result.response).toBe('聊完了');
      expect(result.nextState.status).toBe('COMPLETED');
    });

    it('falls back to the closing message when the node returns none', async () => {
      mockInterviewing.mockResolvedValue({ shouldContinue: true });

      const result = await runInterviewGraph(state(), { userId: 'u1', content: 'hi' });

      expect(result.response).toBe(DEFAULT_CLOSING_MESSAGE);
    });

    it('schedules analysis when the interview completes', async () => {
      mockInterviewing.mockResolvedValue({ response: 'bye', shouldContinue: false });

      await runInterviewGraph(state(), { userId: 'u1', content: 'end' });
      await waitForCall(() => expect(mockAnalyze).toHaveBeenCalledWith('iv-1'));

      expect(mockAnalyze).toHaveBeenCalledWith('iv-1');
    });

    it('does not schedule analysis when the interview continues', async () => {
      mockInterviewing.mockResolvedValue({ response: 'next', shouldContinue: true });

      await runInterviewGraph(state(), { userId: 'u1', content: 'hi' });
      await new Promise((r) => setImmediate(r));

      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it('skips scheduling when the state has no interview id', async () => {
      mockInterviewing.mockResolvedValue({ response: 'bye', shouldContinue: false });

      await runInterviewGraph(state({ interviewId: undefined }), {
        userId: 'u1',
        content: 'end',
      });
      await new Promise((r) => setImmediate(r));

      expect(mockAnalyze).not.toHaveBeenCalled();
    });

    it('logs without throwing when the async analysis fails', async () => {
      mockAnalyze.mockRejectedValue(new Error('analysis exploded'));
      mockInterviewing.mockResolvedValue({ response: 'bye', shouldContinue: false });

      await runInterviewGraph(state(), { userId: 'u1', content: 'end' });
      await waitForCall(() => expect(mockAnalyze).toHaveBeenCalledWith('iv-1'));

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Async analysis failed'),
        expect.objectContaining({ interviewId: 'iv-1', error: 'analysis exploded' })
      );
    });

    it('stringifies a non-Error analysis rejection', async () => {
      mockAnalyze.mockRejectedValue('plain failure');
      mockInterviewing.mockResolvedValue({ response: 'bye', shouldContinue: false });

      await runInterviewGraph(state(), { userId: 'u1', content: 'end' });
      await waitForCall(() => expect(mockAnalyze).toHaveBeenCalledWith('iv-1'));

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Async analysis failed'),
        expect.objectContaining({ error: 'plain failure' })
      );
    });
  });

  describe('diagnostics', () => {
    it('logs a preview of the node result', async () => {
      mockInterviewing.mockResolvedValue({ response: 'a'.repeat(120), shouldContinue: true });

      await runInterviewGraph(state(), { userId: 'u1', content: 'hi' });

      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('interviewingNode result'),
        expect.objectContaining({ responsePreview: 'a'.repeat(50) })
      );
    });
  });
});
