import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planningNode } from '../src/core/nodes/planning.js';
import { loadTemplateContent } from '../src/core/nodes/template-utils.js';
import type { InterviewState } from '../src/core/types/index.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * @test REQ-208-01
 * @intent 验证开场问候不会把模板名插值成 undefined：模板名从 Template 行补齐，缺失时用泛化文案
 * @covers loadTemplateContent 合并 DB 模板名、content 自带 name 时优先用它、planningNode 在无名时不渲染「undefined」
 *
 * The template `name` lives in the `Template` row, never in the content JSON, so
 * `content.name` was always `undefined` on the DB path. It only became visible
 * after the planning gate was fixed (#200): before that the greeting was never
 * sent. Every template whose opening line lacks an intent word rendered
 * `欢迎参加「undefined」访谈调查`.
 */
const mockFindById = vi.fn();

vi.mock('../src/repositories/template.repository.js', () => ({
  TemplateRepository: class {
    findById = mockFindById;
  },
}));

// polishFirstQuestion calls the LLM; the greeting is what these tests assert.
vi.mock('../src/services/followup.service.js', () => ({
  polishFirstQuestion: vi.fn(async (q: string) => q),
}));

function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'u1',
    interviewId: 'iv-1',
    templateId: 'tpl-1',
    status: 'PENDING',
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

const prisma = {} as PrismaClient;

/** Content whose opening has no intent word, so the prepend branch runs. */
function vagueContent(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    invitationPrompt: '您好！我们虚拟组织正在做一些研究，想听听您的想法。',
    questions: ['第一个问题？'],
    closingMessage: '谢谢！',
    ...extra,
  });
}

describe('template name resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills the name from the Template row', async () => {
    mockFindById.mockResolvedValue({
      id: 'tpl-1',
      name: '国际需求工程专家组',
      content: vagueContent(),
    });

    const content = await loadTemplateContent('tpl-1', prisma);

    expect(content.name).toBe('国际需求工程专家组');
  });

  it('prefers a name present in the content JSON', async () => {
    mockFindById.mockResolvedValue({
      id: 'tpl-1',
      name: 'DB 名称',
      content: vagueContent({ name: '内容内名称' }),
    });

    const content = await loadTemplateContent('tpl-1', prisma);

    expect(content.name).toBe('内容内名称');
  });

  it('falls back to the default content when the template is missing', async () => {
    mockFindById.mockResolvedValue(null);

    const content = await loadTemplateContent('tpl-1', prisma);

    expect(content.name).toBe('Default Interview');
  });
});

describe('planningNode greeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the template in the greeting instead of interpolating undefined', async () => {
    mockFindById.mockResolvedValue({
      id: 'tpl-1',
      name: '国际需求工程专家组',
      content: vagueContent(),
    });

    const result = await planningNode(state(), prisma);

    expect(result.response).not.toContain('undefined');
    expect(result.response).toContain('国际需求工程专家组');
    expect(result.response).toContain('欢迎参加');
  });

  it('stays grammatical when no name is available at all', async () => {
    mockFindById.mockResolvedValue({ id: 'tpl-1', name: '', content: vagueContent() });

    const result = await planningNode(state(), prisma);

    expect(result.response).not.toContain('undefined');
    expect(result.response).toContain('欢迎参加本次访谈调查');
    // No empty quotes left behind by an absent name.
    expect(result.response).not.toContain('「」');
  });

  it('does not prepend a title when the opening already signals intent', async () => {
    mockFindById.mockResolvedValue({
      id: 'tpl-1',
      name: '质量效能团队',
      content: JSON.stringify({
        invitationPrompt: '这是一次内部访谈，想了解您最近的工作。',
        questions: ['第一个问题？'],
      }),
    });

    const result = await planningNode(state(), prisma);

    expect(result.response).not.toContain('欢迎参加');
    expect(result.response).toContain('这是一次内部访谈');
  });
});
