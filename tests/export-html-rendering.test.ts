import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * @test REQ-155-EXPORT
 * @intent 通过捕获 renderPdfHtml 生成的 HTML，覆盖受邀者信息解析、对话表格、报告段落等分支，提升 export.service 的变异分数
 * @covers loadInviteeInfo 的匹配/类型守卫、headerParts 的有无姓名电话、消息角色标签与背景色、报告段落的有无
 *
 * Gate M measured export.service.ts at 47% with 121 survivors, the largest
 * cluster in `loadInviteeInfo` and the header/table HTML — code that ran on
 * every export but whose output no test ever inspected, because the existing
 * suite let real chromium produce a PDF and only checked the file existed.
 * Mocking playwright makes the HTML the observable.
 */

const capturedHtml: string[] = [];

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({
        setContent: vi.fn(async (html: string) => {
          capturedHtml.push(html);
        }),
        pdf: vi.fn(async ({ path }: { path: string }) => {
          writeFileSync(path, '%PDF-mock');
        }),
      })),
      close: vi.fn(async () => undefined),
    })),
  },
}));

const mockWarn = vi.fn();
vi.mock('../src/utils/logger.js', () => ({
  warn: (...a: unknown[]) => mockWarn(...a),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const { ExportService } = await import('../src/services/export.service.js');

const INTERVIEW = {
  id: 'iv-1',
  userId: 'user-001',
  status: 'COMPLETED',
  templateId: 'tpl-1',
  planId: 'plan-1',
  messages: [
    { role: 'assistant', content: '您好！' },
    { role: 'user', content: '你好\n第二行' },
  ],
  responses: [],
  user: { name: null },
  template: { name: '测试模板', content: '{}' },
};

function makePrisma(options: {
  inviteeData?: unknown;
  report?: unknown;
}): PrismaClient {
  return {
    interview: { findUnique: vi.fn().mockResolvedValue(INTERVIEW) },
    analysisReport: { findFirst: vi.fn().mockResolvedValue(options.report ?? null) },
    interviewPlan: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          options.inviteeData === undefined ? null : { inviteeData: options.inviteeData }
        ),
    },
  } as unknown as PrismaClient;
}

describe('PDF HTML rendering', () => {
  let dir: string;

  beforeEach(() => {
    capturedHtml.length = 0;
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), 'export-html-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function render(inviteeData: unknown, report: unknown = null): Promise<string> {
    const before = capturedHtml.length;
    const service = new ExportService(makePrisma({ inviteeData, report }), dir, join(dir, 'f'));
    await service.exportInterviewToPdf('iv-1');
    expect(capturedHtml.length).toBe(before + 1);
    return capturedHtml[before] as string;
  }

  describe('invitee info', () => {
    it('renders the matching invitee name and phone', async () => {
      const html = await render([
        { userId: 'other', name: '别人' },
        { userId: 'user-001', name: '张三', phone: '13800000000' },
      ]);

      expect(html).toContain('姓名: 张三');
      expect(html).toContain('电话: 13800000000');
      expect(html).not.toContain('别人');
    });

    it('falls back to the user id when no name matches', async () => {
      const html = await render([{ userId: 'someone-else', name: '别人' }]);

      expect(html).toContain('用户: user-001');
      expect(html).not.toContain('姓名:');
      expect(html).not.toContain('电话:');
    });

    it('omits the phone when the matching entry has none', async () => {
      const html = await render([{ userId: 'user-001', name: '张三' }]);

      expect(html).toContain('姓名: 张三');
      expect(html).not.toContain('电话:');
    });

    it('omits the name when the matching entry has none', async () => {
      const html = await render([{ userId: 'user-001', phone: '13900000000' }]);

      expect(html).toContain('电话: 13900000000');
      expect(html).not.toContain('姓名:');
    });

    it('ignores non-string name and phone values', async () => {
      const html = await render([{ userId: 'user-001', name: 42, phone: { x: 1 } }]);

      expect(html).not.toContain('姓名:');
      expect(html).not.toContain('电话:');
    });

    it('survives inviteeData that is not an array', async () => {
      const html = await render({ userId: 'user-001', name: '张三' });

      expect(html).toContain('用户: user-001');
      expect(html).not.toContain('姓名:');
    });

    it('skips null and primitive entries without throwing', async () => {
      const html = await render([null, 'oops', 7, { userId: 'user-001', name: '张三' }]);

      expect(html).toContain('姓名: 张三');
    });

    it('renders nothing extra when the plan is missing', async () => {
      const html = await render(undefined);

      expect(html).toContain('用户: user-001');
      expect(html).not.toContain('姓名:');
    });
  });

  describe('conversation table', () => {
    it('labels and shades bot and interviewee rows differently', async () => {
      const html = await render(null);

      expect(html).toContain('🤖 机器人');
      expect(html).toContain('👤 受访者');
      // The bot row gets the tinted background, the user row stays white.
      expect(html).toContain('background:#f0f7ff');
      expect(html).toContain('background:#fff');
    });

    it('turns newlines in answers into line breaks', async () => {
      const html = await render(null);

      expect(html).toContain('你好<br>第二行');
    });

    it('escapes html in message content', async () => {
      const prisma = makePrisma({ inviteeData: null });
      vi.mocked(prisma.interview.findUnique).mockResolvedValue({
        ...INTERVIEW,
        messages: [{ role: 'user', content: '<script>alert(1)</script>' }],
      } as never);
      const service = new ExportService(prisma, dir, join(dir, 'f'));
      await service.exportInterviewToPdf('iv-1');

      const html = capturedHtml[0] as string;
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('report section', () => {
    function report(sentiment: string) {
      return {
        content: '这是报告正文',
        keyFindings: ['发现一', '发现二'],
        sentiment,
        recommendations: ['建议一'],
      };
    }

    it('renders findings, sentiment and recommendations when a report exists', async () => {
      const html = await render(null, report('positive'));

      expect(html).toContain('这是报告正文');
      expect(html).toContain('发现一');
      expect(html).toContain('发现二');
      expect(html).toContain('建议一');
      // Sentiment is localised rather than echoed raw.
      expect(html).toContain('积极');
      expect(html).not.toContain('positive');
    });

    it('translates every known sentiment', async () => {
      expect(await render(null, report('negative'))).toContain('消极');
      expect(await render(null, report('neutral'))).toContain('中性');
    });

    it('falls back to the raw value for an unknown sentiment', async () => {
      const html = await render(null, report('mixed'));

      expect(html).toContain('mixed');
    });

    it('omits the report section when there is no report', async () => {
      const html = await render(null, null);

      expect(html).not.toContain('这是报告正文');
    });
  });
});
