import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * @test REQ-BOT-NAME-01
 * @intent 验证邀约文案中的机器人名称来自 DINGTALK_BOT_NAME 配置，缺省时使用泛化措辞而非硬编码品牌名
 * @covers 配置了 bot 名时文案包含该名、未配置时不包含任何硬编码品牌名、有/无 invitationPrompt 两种文案分支
 *
 * The invitation text used to hardcode one deployment's bot name, so every
 * other deployment told invitees to message a robot that did not exist there.
 * These tests pin the copy to the config and assert the hardcoded brand never
 * comes back.
 */
vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
  messageSender: {
    sendTextMessage: vi.fn().mockResolvedValue({
      taskId: 'mock-task',
      successCount: 1,
      failedUserIds: [],
    }),
  },
}));

const BOT_NAME_VAR = 'DINGTALK_BOT_NAME';

/** The brand string that used to be hardcoded; it must never reappear. */
const LEGACY_BRAND = 'OpenClaw小钉';

interface PlanFixtureOptions {
  invitationPrompt?: string;
}

function planFixture({ invitationPrompt }: PlanFixtureOptions = {}) {
  const content = JSON.stringify({
    ...(invitationPrompt === undefined ? {} : { invitationPrompt }),
    questions: ['q1'],
    closingMessage: '感谢参与！',
  });
  return {
    id: 'plan-1',
    name: '质量效能访谈计划',
    templateId: 'template-1',
    template: { content },
    startedAt: null,
    interviews: [{ userId: 'user-1', status: 'PENDING' }],
  };
}

interface MockPrisma {
  interviewPlan: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  interview: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
}

describe('invitation copy names the configured bot', () => {
  let service: InterviewPlanService;
  let prisma: MockPrisma;

  beforeEach(() => {
    delete process.env[BOT_NAME_VAR];
    prisma = {
      interviewPlan: {
        findUnique: vi.fn().mockResolvedValue(planFixture({ invitationPrompt: '开场白正文' })),
        update: vi.fn().mockResolvedValue({}),
      },
      interview: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      $disconnect: vi.fn(),
    };
    service = new InterviewPlanService(prisma as unknown as PrismaClient);
  });

  afterEach(() => {
    delete process.env[BOT_NAME_VAR];
    vi.clearAllMocks();
  });

  async function sentMessage(): Promise<string> {
    const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
    await service.sendInvitations('plan-1');
    const call = vi.mocked(messageSender.sendTextMessage).mock.calls[0];
    expect(call).toBeDefined();
    return call?.[1] as string;
  }

  it('uses the configured bot name when the prompt branch renders', async () => {
    process.env[BOT_NAME_VAR] = '智能访谈';

    const message = await sentMessage();

    expect(message).toContain('智能访谈');
    expect(message).toContain('开场白正文');
    expect(message).not.toContain(LEGACY_BRAND);
  });

  it('uses the configured bot name when the fallback branch renders', async () => {
    process.env[BOT_NAME_VAR] = '智能访谈';
    prisma.interviewPlan.findUnique.mockResolvedValue(planFixture({}));

    const message = await sentMessage();

    expect(message).toContain('智能访谈');
    expect(message).toContain('您被邀请参与');
    expect(message).not.toContain(LEGACY_BRAND);
  });

  it('stays generic and never names a brand when unset', async () => {
    const message = await sentMessage();

    expect(message).toContain('本机器人');
    expect(message).not.toContain(LEGACY_BRAND);
    // A generic invitation must not invent a name either.
    expect(message).not.toContain('智能访谈');
  });

  it('treats a blank bot name as unset rather than rendering empty', async () => {
    process.env[BOT_NAME_VAR] = '   ';

    const message = await sentMessage();

    expect(message).toContain('本机器人');
    expect(message).not.toContain('回复   任意消息');
  });

  it('trims surrounding whitespace from the configured name', async () => {
    process.env[BOT_NAME_VAR] = '  智能访谈  ';

    const message = await sentMessage();

    expect(message).toContain('回复 智能访谈 任意消息');
    expect(message).not.toContain('  智能访谈  ');
  });

  it('keeps the plan name in both copy branches', async () => {
    process.env[BOT_NAME_VAR] = '智能访谈';

    expect(await sentMessage()).toContain('质量效能访谈计划');

    vi.mocked(prisma.interviewPlan.findUnique).mockResolvedValue(planFixture({}));
    expect(await sentMessage()).toContain('质量效能访谈计划');
  });
});
