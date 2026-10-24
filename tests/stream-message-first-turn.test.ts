import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { StreamMessageService } from '../src/services/stream-message.service.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';
import { TestDatabase } from './helpers/test-db.js';

/**
 * @test REQ-200-02
 * @intent 验证首条消息走真实服务路径时不会写入 Response、不消耗 followup 配额、并产出 planningNode 的开场问候
 * @covers StreamMessageService.processStreamMessage → runInterviewGraph → planningNode/interviewingNode 全链路，PENDING 与 ACTIVE 两轮
 *
 * The #200 fix is only meaningful end to end. The graph-level tests hand
 * `runInterviewGraph` a fresh PENDING state, but no production caller ever
 * produces one: the service flips the status to PROCESSING for two-phase
 * persistence *before* calling the graph, so the greeting path stayed dead
 * while the graph tests stayed green. This suite drives the real
 * `StreamMessageService` against a real `InterviewStateRepository` (PGlite) and
 * reads the result back out of the database, so the assertions are on what an
 * interviewee would actually receive and what a report would actually see.
 *
 * Only the two true externals are stubbed: the LLM (followup service) and the
 * DingTalk webhook (`fetch`).
 */

const { mockPolishFirstQuestion, mockGenerateSmartResponse } = vi.hoisted(() => ({
  mockPolishFirstQuestion: vi.fn(),
  mockGenerateSmartResponse: vi.fn(),
}));

// Partial mock: only the two LLM entry points are stubbed. The module also
// exposes pure helpers (addContinuityLeadIn, buildForcedNextTransition) that the
// interviewing node imports directly; replacing the whole module with two
// functions made those imports fail at call time, the node swallowed the error
// into its fallback branch, and the suite was silently asserting against the
// degraded path instead of the real one.
vi.mock('../src/services/followup.service.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    polishFirstQuestion: mockPolishFirstQuestion,
    generateSmartResponse: mockGenerateSmartResponse,
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

/** A template whose opening line carries no intent word, so the greeting is prepended. */
const INVITATION_PROMPT = '您好！我们虚拟组织正在做一些研究，想听听您的想法。';
const QUESTIONS = [
  '第一题：您负责什么工作？',
  '第二题：最近的挑战是什么？',
  '第三题：还有什么补充？',
];

function envelope(content: string, messageId: string): StreamMessage {
  return {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: {
      topic: '/v1.0/im/bot/messages/get',
      messageId,
      time: '2024-01-01T00:00:00Z',
    },
    data: JSON.stringify({ senderStaffId: 'user-first-turn', text: { content } }),
  } as StreamMessage;
}

interface PersistedTurn {
  status: string;
  currentQuestion: number;
  followupCount: number;
  messages: Array<{ role: string; content: string }>;
  responses: Array<{ questionId: string; content: string; isFollowup: boolean }>;
}

describe('first message is not stored as the answer to q1', () => {
  let testDb: TestDatabase;
  let service: StreamMessageService;
  let interviewId: string;

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, text: async () => 'ok' });
    mockPolishFirstQuestion.mockImplementation(async (question: string) => question);
    // The model never ends the interview: this suite is about the first turn,
    // not about the completion path.
    mockGenerateSmartResponse.mockResolvedValue({
      action: 'NEXT',
      response: '谢谢您的回答，我们继续。',
      shouldEndInterview: false,
    });

    const prisma = testDb.getPrisma();
    const template = await prisma.template.create({
      data: {
        name: '首轮回归模板',
        content: JSON.stringify({
          invitationPrompt: INVITATION_PROMPT,
          questions: QUESTIONS,
          closingMessage: '感谢参与！',
        }),
        status: 'PUBLISHED',
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    interviewId = await new InterviewStateRepository(prisma).createInterview(
      'user-first-turn',
      template.id
    );
    service = new StreamMessageService(new InterviewStateRepository(prisma));
  });

  afterEach(async () => {
    if (interviewId) await testDb.cleanup({ interviews: [interviewId] });
    await testDb.getPrisma().template.deleteMany({ where: { name: '首轮回归模板' } });
  });

  async function persisted(): Promise<PersistedTurn> {
    const prisma = testDb.getPrisma();
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: interviewId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' } },
      },
    });
    return interview as unknown as PersistedTurn;
  }

  it('delivers planningNode greeting as the first assistant message', async () => {
    const result = await service.processStreamMessage(
      envelope('开始访谈。', 'msg-1'),
      0,
      testDb.getPrisma()
    );

    expect(result.success).toBe(true);
    const reply = result.response ?? '';
    expect(reply).toContain('欢迎参加');
    expect(reply).toContain('首轮回归模板');
    expect(reply).toContain(INVITATION_PROMPT);
    expect(reply).toContain(QUESTIONS[0]);
    expect(reply).not.toContain('undefined');
  });

  it('does not create a Response for the opening message', async () => {
    await service.processStreamMessage(envelope('开始访谈。', 'msg-2'), 0, testDb.getPrisma());

    const turn = await persisted();
    expect(turn.responses).toHaveLength(0);
    // The opening message is still part of the conversation history...
    expect(turn.messages.some((m) => m.role === 'user' && m.content === '开始访谈。')).toBe(true);
    // ...but it did not advance past question 1.
    expect(turn.currentQuestion).toBe(0);
    expect(turn.status).toBe('ACTIVE');
  });

  it('does not consume a follow-up slot on the opening message', async () => {
    await service.processStreamMessage(envelope('开始访谈。', 'msg-3'), 0, testDb.getPrisma());

    expect((await persisted()).followupCount).toBe(0);
    // The LLM judge for a real answer must not have run for a first turn.
    expect(mockGenerateSmartResponse).not.toHaveBeenCalled();
  });

  it('records the real answer to q0 and yields no duplicate questionIds', async () => {
    await service.processStreamMessage(envelope('开始访谈。', 'msg-4'), 0, testDb.getPrisma());
    const second = await service.processStreamMessage(
      envelope('我是做质量平台的。', 'msg-5'),
      0,
      testDb.getPrisma()
    );

    expect(second.success).toBe(true);
    // The real (mocked) model reply drives this turn, proving the answering path
    // ran rather than the catch-all fallback in `interviewingNode`.
    expect(second.response).toContain('谢谢您的回答，我们继续。');
    expect(second.response).not.toContain('欢迎参加');

    const turn = await persisted();
    expect(turn.responses).toHaveLength(1);
    expect(turn.responses[0]?.questionId).toBe('q0');
    expect(turn.responses[0]?.content).toBe('我是做质量平台的。');
    // The bug produced two responses for q0 (the opening message plus the real
    // answer), so the number of answer/question pairs exceeded the question count.
    const questionIds = turn.responses.map((r) => r.questionId);
    expect(new Set(questionIds).size).toBe(questionIds.length);
    // Exactly one "开始访谈" assistant turn, not a fresh state that lost the history.
    expect(turn.messages.filter((m) => m.role === 'assistant').length).toBeGreaterThanOrEqual(2);
    expect(turn.currentQuestion).toBe(1);
  });

  it('does not re-run planningNode when a later turn re-enters the graph', async () => {
    await service.processStreamMessage(envelope('开始访谈。', 'msg-6'), 0, testDb.getPrisma());
    await service.processStreamMessage(envelope('第一题的回答', 'msg-7'), 0, testDb.getPrisma());

    const assistantTexts = (await persisted()).messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content);

    // The greeting appears once, at the top, never again mid-interview.
    expect(assistantTexts.filter((text) => text.includes('欢迎参加'))).toHaveLength(1);
  });
});
