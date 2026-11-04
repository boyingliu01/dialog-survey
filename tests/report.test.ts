import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenAICompatibleLLM } from '../src/integrations/llm/openai-compatible.js';
import {
  createEmptyDimensionReport,
  generateReport,
  generateReportWithDimensions,
} from '../src/services/report.service.js';

vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: {
    fromEnv: () => ({
      chat: vi.fn(),
    }),
  },
  DEFAULT_MODEL: 'deepseek-v3.2',
}));

vi.mock('../src/utils/retry.js', () => ({
  withRetry: vi.fn((fn) => fn()),
}));

describe('Report Service', () => {
  beforeEach(() => {
    vi.stubEnv('VOLCENGINE_API_KEY', 'test-key');
    vi.stubEnv('REPORTS_DIR', '/tmp/reports');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('generateReport', () => {
    /**
     * @test REQ-006-2-01
     * @intent 测试LLM能否成功生成包含关键发现的报告
     */
    it('should generate report with LLM response', async () => {
      const mockLLMResponse = {
        content: '关键发现：候选人有5年经验\n情感分析：积极\n行动建议：建议进一步面试',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-123', '工作经历', [
        { question: '请介绍你的工作经历', answer: '我在科技公司工作了5年' },
      ]);

      expect(result.interviewId).toBe('interview-123');
      expect(result.content).toContain('关键发现');
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.sentiment).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    /**
     * @test REQ-006-2-01
     * @intent 测试当LLM调用失败时是否能生成回退报告
     */
    it('should create fallback report when LLM fails', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('LLM error'));
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-123', '工作经历', [
        { question: '请介绍你的工作经历', answer: '我在科技公司工作了5年' },
      ]);

      expect(result.interviewId).toBe('interview-123');
      expect(result.sentiment).toBe('neutral');
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain('建议进行更深入的后续访谈');
    });

    /**
     * @test REQ-006-2-02
     * @intent 测试报告生成服务能否正确解析情感分析结果
     */
    it('should parse sentiment from content', async () => {
      const mockLLMResponse = {
        content: '关键发现：test\n情感分析：非常积极\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.sentiment).toBe('positive');
    });

    /**
     * @test REQ-006-2-02
     * @intent a reply with none of the three sections yields defaults, not a crash
     */
    it('should default every section when the reply has none of them', async () => {
      // No 关键发现, no 情感分析, no 行动建议: all three captures are absent, so
      // each section has to fall back on its default. A crash here would surface
      // to the caller as a generic report failure and lose the whole report.
      const chatMock = vi.fn().mockResolvedValue({ content: '这是一段自由格式的回答。' });
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-456', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.keyFindings).toEqual([]);
      expect(result.recommendations).toEqual([]);
      expect(result.sentiment).toBe('neutral');
    });

    /**
     * @test REQ-006-2-01
     * @intent 测试报告生成服务能否处理空问答对参数
     */
    it('should handle empty qaPairs', async () => {
      const mockLLMResponse = {
        content: '关键发现：无\n情感分析：neutral\n行动建议：无',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-123', 'test', []);

      expect(result.interviewId).toBe('interview-123');
    });

    /**
     * @test REQ-006-3-01
     * @intent 测试报告生成服务能否限制关键发现数量不超过5个
     */
    it('should limit key findings to 5 items', async () => {
      const mockLLMResponse = {
        content:
          '关键发现：发现1，发现2，发现3，发现4，发现5，发现6，发现7\n情感分析：neutral\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);

      expect(result.keyFindings.length).toBeLessThanOrEqual(5);
    });

    /**
     * @test REQ-006-3-01
     * @intent 测试报告生成服务是否设置了生成时间戳
     */
    it('should set generatedAt timestamp', async () => {
      const mockLLMResponse = {
        content: '关键发现：test\n情感分析：neutral\n行动建议：test',
      };

      const chatMock = vi.fn().mockResolvedValue(mockLLMResponse);
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const beforeTime = new Date();
      const result = await generateReport('interview-123', 'test', [
        { question: 'Q1', answer: 'A1' },
      ]);
      const afterTime = new Date();

      expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.generatedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  /**
   * Section parsing is regex-driven, and every earlier case fed it the same
   * single-line shape ("关键发现：x / 情感分析：y / 行动建议：z"). All the regex
   * mutants survived that, because a pattern only has to match the one input it
   * is given. These cases vary the SHAPE — Markdown headers, a missing colon,
   * reordered and absent sections, multi-line bullets — so a broken pattern has
   * to show. Mutation-verified: flipping each lookahead, the sentiment
   * alternation, and the bullet cap each fails at least one case here.
   */
  describe('section parsing (regex boundaries)', () => {
    /** Drive generateReport with a fixed LLM body and return the parsed result. */
    async function parseWith(content: string): Promise<{
      keyFindings: string[];
      sentiment: string;
      recommendations: string[];
    }> {
      const chatMock = vi.fn().mockResolvedValue({ content });
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;
      const result = await generateReport('i-1', 'd', [{ question: 'Q', answer: 'A' }]);
      return {
        keyFindings: result.keyFindings,
        sentiment: result.sentiment,
        recommendations: result.recommendations,
      };
    }

    /** Build a multi-line document without embedding escapes in a literal. */
    const doc = (...lines: string[]): string => lines.join('\n');

    it('parses Markdown "### 1. 关键发现" headers, not just "关键发现："', async () => {
      const r = await parseWith(
        doc(
          '### 1. 关键发现',
          '- 五年经验',
          '- 沟通良好',
          '### 2. 情感分析',
          '积极',
          '### 3. 行动建议',
          '- 安排复试'
        )
      );
      expect(r.keyFindings).toEqual(['五年经验', '沟通良好']);
      expect(r.recommendations).toEqual(['安排复试']);
    });

    it('parses the no-colon "关键发现 内容" form', async () => {
      const r = await parseWith(doc('关键发现 候选人经验丰富', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['候选人经验丰富']);
    });

    it('treats a missing section as empty rather than inventing content', async () => {
      const r = await parseWith('情感分析：积极');
      expect(r.keyFindings).toEqual([]);
      expect(r.recommendations).toEqual([]);
    });

    it('defaults sentiment to neutral when the section is absent', async () => {
      const r = await parseWith('关键发现：某发现');
      expect(r.sentiment).toBe('neutral');
    });

    it('normalises each Chinese sentiment word', async () => {
      expect((await parseWith('情感分析：积极')).sentiment).toBe('positive');
      expect((await parseWith('情感分析：消极')).sentiment).toBe('negative');
      expect((await parseWith('情感分析：中立')).sentiment).toBe('neutral');
      expect((await parseWith('情感分析：正面')).sentiment).toBe('positive');
      expect((await parseWith('情感分析：负面')).sentiment).toBe('negative');
    });

    it('recognises the English sentiment words too', async () => {
      expect((await parseWith('情感分析：positive')).sentiment).toBe('positive');
      expect((await parseWith('情感分析：negative')).sentiment).toBe('negative');
      expect((await parseWith('情感分析：neutral')).sentiment).toBe('neutral');
    });

    it('stops the 关键发现 capture at the next section', async () => {
      const r = await parseWith(doc('- 发现A', '情感分析：积极', '行动建议：- 建议B'));
      expect(r.keyFindings).not.toContain('情感分析：积极');
      expect(r.recommendations).toEqual(['建议B']);
    });

    it('caps key findings at five', async () => {
      const bullets = Array.from({ length: 8 }, (_, i) => `- 发现${i + 1}`).join('\n');
      const r = await parseWith(doc('关键发现：', bullets, '情感分析：积极'));
      expect(r.keyFindings).toHaveLength(5);
    });

    it('strips Markdown emphasis, code spans and table pipes from bullets', async () => {
      const r = await parseWith(
        doc('关键发现：', '- **粗体**发现', '- `代码`片段', '- |表格|单元|', '情感分析：积极')
      );
      expect(r.keyFindings).toEqual(['粗体发现', '代码片段', '表格 单元']);
    });

    it('drops blank lines, table rules and separator-only lines', async () => {
      const r = await parseWith(
        doc('关键发现：', '- 真实发现', '', '----', '|---|---|', '- 另一发现', '情感分析：积极')
      );
      expect(r.keyFindings).toEqual(['真实发现', '另一发现']);
    });

    it('strips HTML tags and <br> from bullets', async () => {
      const r = await parseWith(doc('关键发现：', '- <b>强调</b>内容<br>后文', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['强调内容 后文']);
    });

    it('strips single-asterisk italics as well as double', async () => {
      const r = await parseWith(doc('关键发现：', '- *斜体*文字', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['斜体文字']);
    });

    it('strips a numbered-list prefix, not just a bullet character', async () => {
      const r = await parseWith(doc('关键发现：', '1. 第一项', '2. 第二项', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['第一项', '第二项']);
    });

    it('treats a "##" line inside the findings block as the next section', async () => {
      // After the heading fix, ANY `#` line ends the section. A sub-heading
      // inside the findings block therefore stops the capture rather than being
      // stripped as a bullet prefix -- which is the point of the fix.
      const r = await parseWith(doc('关键发现：', '## 子标题文字', '情感分析：积极'));
      expect(r.keyFindings).toEqual([]);
    });

    it('keeps a single underscore or asterisk that is not emphasis', async () => {
      // A lone marker with no partner must survive: over-stripping would eat
      // real content.
      const r = await parseWith(doc('关键发现：', '- 数值 5 * 3 = 15', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['数值 5 * 3 = 15']);
    });

    it('does not treat a line of dashes inside prose as a separator', async () => {
      const r = await parseWith(doc('关键发现：', '- 前缀 ---- 后缀', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['前缀 ---- 后缀']);
    });

    it('caps recommendations at five too', async () => {
      const bullets = Array.from({ length: 7 }, (_, i) => `- 建议${i + 1}`).join('\n');
      const r = await parseWith(doc('行动建议：', bullets));
      expect(r.recommendations).toHaveLength(5);
    });

    it('parses recommendations as a Markdown "### 3. 行动建议" header', async () => {
      const r = await parseWith(doc('### 3. 行动建议', '- 安排复试', '- 补充背调'));
      expect(r.recommendations).toEqual(['安排复试', '补充背调']);
    });

    it('maps mixed positive and negative wording to positive (precedence)', async () => {
      // The table is ordered, so a phrase carrying both resolves positive. That
      // precedence is a decision, not an accident -- it used to fall out of `||`
      // ordering and now falls out of the row order.
      const r = await parseWith(doc('关键发现：某发现', '情感分析：积极但也有一些负面'));
      expect(r.sentiment).toBe('positive');
    });

    it('resolves negative when only negative wording is present', async () => {
      const r = await parseWith(doc('关键发现：某发现', '情感分析：总体消极'));
      expect(r.sentiment).toBe('negative');
    });

    it('falls back to neutral for wording it does not recognise', async () => {
      const r = await parseWith(doc('关键发现：某发现', '情感分析：难以判断'));
      expect(r.sentiment).toBe('neutral');
    });

    it('matches sentiment case-insensitively', async () => {
      const r = await parseWith(doc('关键发现：某发现', '情感分析：POSITIVE'));
      expect(r.sentiment).toBe('positive');
    });

    it('parses the sentiment word when a header carries no colon', async () => {
      const r = await parseWith(doc('关键发现：某发现', '情感分析 积极'));
      expect(r.sentiment).toBe('positive');
    });

    it('swallows MULTIPLE spaces after the header word, not just one', async () => {
      // `\s*` vs `\s` here is a real difference: with a single `\s` the extra
      // spaces stay in the capture and become leading whitespace in the bullet.
      expect((await parseWith('关键发现  双空格内容')).keyFindings).toEqual(['双空格内容']);
      expect((await parseWith('## 关键发现  双空格内容')).keyFindings).toEqual(['双空格内容']);
    });

    it('swallows trailing spaces before the newline after a header', async () => {
      // Same class: `\s*` before `\n?` must consume "   " so the blank tail does
      // not survive into the capture.
      const r = await parseWith(doc('关键发现   ', '- 实际内容', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['实际内容']);
    });

    it('finds content on the same line as a "##" heading', async () => {
      const r = await parseWith(doc('## 关键发现：同行内容', '情感分析：积极'));
      expect(r.keyFindings).toEqual(['同行内容']);
    });
  });

  /**
   * The LLM-failure path and the file write had no tests: `generateReport` is
   * always driven here with a working model, and nothing ever looked at what
   * landed on disk. Both are failure/reporting paths, which is exactly the kind
   * of code that stays green while being wrong.
   */
  describe('fallback and persistence', () => {
    it('falls back to a local report when the LLM throws', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('LLM down'));
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('fb-1', '主题', [{ question: 'Q1', answer: 'A1' }]);

      // The fallback is not an empty report: it echoes the transcript so the
      // administrator still has something to read, and it says so honestly with
      // a neutral sentiment rather than guessing.
      expect(result.interviewId).toBe('fb-1');
      expect(result.sentiment).toBe('neutral');
      expect(result.keyFindings).toEqual(['A1']);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.content).toContain('主题');
      expect(result.content).toContain('Q1');
    });

    it('truncates a fallback finding to 50 characters', async () => {
      const chatMock = vi.fn().mockRejectedValue(new Error('LLM down'));
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const longAnswer = 'x'.repeat(200);
      const result = await generateReport('fb-2', 't', [{ question: 'Q1', answer: longAnswer }]);

      expect(result.keyFindings[0]).toHaveLength(50);
    });

    it('marks a fallback report as not LLM-generated', async () => {
      // `usedLLM` is what tells the operator the analysis is degraded. A truthy
      // fallback would hide every LLM outage.
      const chatMock = vi.fn().mockRejectedValue(new Error('LLM down'));
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('fb-3', 't', [{ question: 'Q', answer: 'A' }]);

      expect(result.usedLLM).toBe(false);
    });

    it('marks a successful LLM report as LLM-generated', async () => {
      const chatMock = vi.fn().mockResolvedValue({ content: '关键发现：某发现\n情感分析：积极' });
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('ok-1', 't', [{ question: 'Q', answer: 'A' }]);

      expect(result.usedLLM).toBe(true);
    });

    it('falls back when the model returns an EMPTY string', async () => {
      // The guard is `!content || content.trim().length === 0`, so a blank
      // response must take the same path as a thrown error -- otherwise the
      // administrator gets an empty report with no explanation.
      const chatMock = vi.fn().mockResolvedValue({ content: '   ' });
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('fb-4', '主题', [{ question: 'Q1', answer: 'A1' }]);

      expect(result.usedLLM).toBe(false);
      expect(result.sentiment).toBe('neutral');
      expect(result.keyFindings).toEqual(['A1']);
    });

    it('falls back when the model returns NO content field', async () => {
      const chatMock = vi.fn().mockResolvedValue({});
      vi.mocked(
        await import('../src/integrations/llm/openai-compatible.js')
      ).OpenAICompatibleLLM.fromEnv = () => ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

      const result = await generateReport('fb-5', 't', [{ question: 'Q', answer: 'A' }]);

      expect(result.usedLLM).toBe(false);
    });

    it('writes the report content to REPORTS_DIR under an id-prefixed name', async () => {
      const { mkdtempSync, readdirSync, readFileSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const dir = mkdtempSync(path.join(tmpdir(), 'report-write-'));
      vi.stubEnv('REPORTS_DIR', dir);

      try {
        const chatMock = vi
          .fn()
          .mockResolvedValue({ content: '关键发现：写入检查\n情感分析：积极' });
        vi.mocked(
          await import('../src/integrations/llm/openai-compatible.js')
        ).OpenAICompatibleLLM.fromEnv = () =>
          ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

        const result = await generateReport('write-1', 't', [{ question: 'Q', answer: 'A' }]);

        const files = readdirSync(dir);
        expect(files).toHaveLength(1);
        expect(files[0].startsWith('write-1_')).toBe(true);
        expect(files[0].endsWith('.md')).toBe(true);
        // The saved bytes are the report content, not the raw LLM response.
        expect(readFileSync(path.join(dir, files[0] as string), 'utf8')).toBe(result.content);
      } finally {
        rmSync(dir, { recursive: true, force: true });
        vi.unstubAllEnvs();
      }
    });

    it('creates REPORTS_DIR when it does not exist yet', async () => {
      const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const base = mkdtempSync(path.join(tmpdir(), 'report-mkdir-'));
      const nested = path.join(base, 'deep', 'reports');
      vi.stubEnv('REPORTS_DIR', nested);

      try {
        const chatMock = vi.fn().mockResolvedValue({ content: '关键发现：目录检查' });
        vi.mocked(
          await import('../src/integrations/llm/openai-compatible.js')
        ).OpenAICompatibleLLM.fromEnv = () =>
          ({ chat: chatMock }) as unknown as OpenAICompatibleLLM;

        await generateReport('mkdir-1', 't', [{ question: 'Q', answer: 'A' }]);

        expect(existsSync(nested)).toBe(true);
      } finally {
        rmSync(base, { recursive: true, force: true });
        vi.unstubAllEnvs();
      }
    });
  });

  /**
   * `generateReportWithDimensions` takes the LLM by INJECTION rather than
   * reading the env, and had no test at all. Its whole job is to survive a
   * model that returns prose, fenced JSON, a JSON array, or throws -- every
   * branch here is a bail-out, which is the shape that stays green while being
   * wrong.
   */
  describe('generateReportWithDimensions', () => {
    /** A stand-in model whose single `chat` call returns `content`. */
    function llmReturning(content: string): OpenAICompatibleLLM {
      return { chat: vi.fn().mockResolvedValue({ content }) } as unknown as OpenAICompatibleLLM;
    }

    it('parses a plain JSON body', async () => {
      const result = await generateReportWithDimensions('d-1', 't', [], null, llmReturning('{}'));
      expect(result.interviewId).toBe('d-1');
      expect(result.dimensionTags).toEqual([]);
      expect(result.emergentTags).toEqual([]);
    });

    it('parses JSON wrapped in ```json fences', async () => {
      const body = JSON.stringify({
        dimensionTags: [{ dimensionId: 'd1', label: '沟通', sentiment: 'positive', quotes: ['q'] }],
        emergentTags: ['新主题'],
      });
      const result = await generateReportWithDimensions(
        'd-2',
        't',
        [],
        null,
        llmReturning(`\`\`\`json\n${body}\n\`\`\``)
      );
      expect(result.dimensionTags).toHaveLength(1);
      expect(result.emergentTags).toEqual(['新主题']);
    });

    it('parses JSON wrapped in bare ``` fences', async () => {
      const body = JSON.stringify({ emergentTags: ['x'] });
      const result = await generateReportWithDimensions(
        'd-3',
        't',
        [],
        null,
        llmReturning(`\`\`\`\n${body}\n\`\`\``)
      );
      expect(result.emergentTags).toEqual(['x']);
    });

    it('returns the empty shape when the model answers with prose', async () => {
      const result = await generateReportWithDimensions(
        'd-4',
        't',
        [],
        null,
        llmReturning('我不知道怎么回答')
      );
      expect(result.dimensionTags).toEqual([]);
      expect(result.emergentTags).toEqual([]);
      expect(result.interviewerRating).toBeUndefined();
    });

    it('returns the empty shape when the JSON is an array rather than an object', async () => {
      // `typeof [] === 'object'`, so a naive guard lets an array through and
      // every field lookup silently yields undefined.
      const result = await generateReportWithDimensions(
        'd-5',
        't',
        [],
        null,
        llmReturning('[1,2,3]')
      );
      expect(result.dimensionTags).toEqual([]);
    });

    it('returns the empty shape for a JSON null body', async () => {
      const result = await generateReportWithDimensions('d-6', 't', [], null, llmReturning('null'));
      expect(result.dimensionTags).toEqual([]);
    });

    it('defaults a mistyped array field to empty instead of trusting it', async () => {
      const body = JSON.stringify({ dimensionTags: 'not-an-array', emergentTags: 42 });
      const result = await generateReportWithDimensions('d-7', 't', [], null, llmReturning(body));
      expect(result.dimensionTags).toEqual([]);
      expect(result.emergentTags).toEqual([]);
    });

    it('keeps a numeric interviewerRating', async () => {
      const result = await generateReportWithDimensions(
        'd-8',
        't',
        [],
        null,
        llmReturning('{"interviewerRating":4}')
      );
      expect(result.interviewerRating).toBe(4);
    });

    it('OMITS interviewerRating when it is not a number', async () => {
      // The key must be absent, not present-and-undefined: the report is spread
      // into stored state, where an explicit undefined still overwrites.
      const result = await generateReportWithDimensions(
        'd-9',
        't',
        [],
        null,
        llmReturning('{"interviewerRating":"4"}')
      );
      expect('interviewerRating' in result).toBe(false);
    });

    it('falls back to the empty report when the model throws', async () => {
      const llm = {
        chat: vi.fn().mockRejectedValue(new Error('boom')),
      } as unknown as OpenAICompatibleLLM;
      const result = await generateReportWithDimensions('d-10', 't', [], null, llm);
      expect(result.interviewId).toBe('d-10');
      expect(result.dimensionTags).toEqual([]);
    });

    it('substitutes a placeholder when no dimensions are preset', async () => {
      const llm = llmReturning('{}');
      await generateReportWithDimensions('d-11', 't', [{ question: 'Q', answer: 'A' }], null, llm);
      const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      expect(call.messages[0].content).toContain('[No preset dimensions]');
      expect(call.messages[0].content).toContain('Q: Q');
    });

    it('passes the preset dimensions through verbatim', async () => {
      const llm = llmReturning('{}');
      await generateReportWithDimensions('d-12', 't', [], 'DIM-JSON', llm);
      const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      expect(call.messages[0].content).toContain('DIM-JSON');
      expect(call.messages[0].content).not.toContain('[No preset dimensions]');
    });

    it('keeps the raw response as the report content', async () => {
      const result = await generateReportWithDimensions(
        'd-13',
        't',
        [],
        null,
        llmReturning('RAW-BODY')
      );
      expect(result.content).toBe('RAW-BODY');
    });

    it('returns a fully-shaped empty report when the model throws', async () => {
      // Callers render this directly, so EVERY field has to be present and of
      // the right type -- a missing array is a template crash, not a blank cell.
      const llm = {
        chat: vi.fn().mockRejectedValue(new Error('boom')),
      } as unknown as OpenAICompatibleLLM;
      const result = await generateReportWithDimensions('d-14', 't', [], null, llm);

      expect(result).toEqual({
        interviewId: 'd-14',
        content: '',
        keyFindings: [],
        sentiment: '',
        recommendations: [],
        generatedAt: expect.any(Date),
        dimensionTags: [],
        emergentTags: [],
      });
    });
  });

  describe('createEmptyDimensionReport', () => {
    it('produces the placeholder shape before the LLM has run', () => {
      const report = createEmptyDimensionReport('empty-1');
      expect(report).toEqual({
        interviewId: 'empty-1',
        content: '',
        keyFindings: [],
        sentiment: '',
        recommendations: [],
        generatedAt: expect.any(Date),
        dimensionTags: [],
        emergentTags: [],
      });
    });

    it('gives each call a fresh timestamp and fresh arrays', () => {
      // Shared mutable arrays would let one caller's push leak into another's
      // report; a shared Date would misreport generation time.
      const a = createEmptyDimensionReport('x');
      const b = createEmptyDimensionReport('x');
      expect(a.dimensionTags).not.toBe(b.dimensionTags);
      expect(a.keyFindings).not.toBe(b.keyFindings);
      expect(a.generatedAt).not.toBe(b.generatedAt);
    });
  });
});
