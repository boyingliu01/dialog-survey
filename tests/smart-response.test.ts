import { describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { promptService } from '../src/services/prompt.service.js';

// Stubbed at module scope on purpose. `generateSmartResponse` calls
// OpenAICompatibleLLM.fromEnv(), which throws when no API key is configured, so
// a live call is impossible here; the contract under test is the result shape.
// Placing this inside `it()` produced the same effect but with a deprecation
// warning, because Vitest hoists it to module scope regardless.
vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: {
    fromEnv: () => ({
      chat: vi.fn().mockResolvedValue({
        content: '{"thinking":"用户认真回答","strategy":1,"action":"NEXT","response":"感谢分享！"}',
      }),
    }),
  },
  DEFAULT_MODEL: 'deepseek-v3.2',
}));

describe('Smart Response System', () => {
  describe('parseLLMResponse', () => {
    /**
     * @test REQ-005-5-08
     * @intent 验证parseLLMResponse函数能正确解析有效的JSON响应，确保智能响应系统可以正确处理JSON格式的LLM输出
     */
    it('should parse valid JSON response', async () => {
      const module = await import('../src/services/followup.service.js');
      expect(module.parseLLMResponse).toBeDefined();

      const validJson = `{"thinking":"用户困惑","strategy":3,"action":"FOLLOWUP","response":"我来解释一下..."}`;
      const result = module.parseLLMResponse(validJson);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('FOLLOWUP');
      expect(result?.response).toBe('我来解释一下...');
      expect(result?.strategy).toBe(3);
    });

    /**
     * @test REQ-005-5-08
     * @intent 验证parseLLMResponse函数能够解析嵌套在markdown代码块中的JSON字符串，确保智能响应系统可以处理不同格式的LLM响应
     */
    it('should parse JSON wrapped in markdown code block', async () => {
      const module = await import('../src/services/followup.service.js');

      const wrappedJson = `
\`\`\`json
{"thinking":"用户认真回答","strategy":1,"action":"NEXT","response":"感谢分享！"}
\`\`\`
`;
      const result = module.parseLLMResponse(wrappedJson);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('NEXT');
    });

    /**
     * @test REQ-005-5-10
     * @intent 验证parseLLMResponse在遇到无效JSON时会返回null，确保智能响应系统可以优雅地处理无效格式
     */
    it('should return null for invalid JSON', async () => {
      const module = await import('../src/services/followup.service.js');

      const invalidJson = 'not a json at all';
      const result = module.parseLLMResponse(invalidJson);

      expect(result).toBeNull();
    });

    /**
     * @test REQ-005-5-10
     * @intent 验证parseLLMResponse在JSON缺少必要字段时会返回null，确保智能响应系统只处理格式完整的响应
     */
    it('should return null for JSON missing required fields', async () => {
      const module = await import('../src/services/followup.service.js');

      const missingFields = '{"thinking":"分析","response":"回应"}';
      const result = module.parseLLMResponse(missingFields);

      expect(result).toBeNull();
    });

    /**
     * @test REQ-005-5-10
     * @intent 验证parseLLMResponse在遇到非法动作时会回退到NEXT动作，确保智能响应系统的健壮性
     * (v2: STAY now advances question just like NEXT, so invalid action fallback to NEXT is equivalent)
     */
    it('should fallback invalid action to NEXT', async () => {
      const module = await import('../src/services/followup.service.js');

      const invalidAction = '{"thinking":"分析","action":"INVALID","response":"回应"}';
      const result = module.parseLLMResponse(invalidAction);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('NEXT');
    });

    /**
     * @test REQ-005-5-03
     * @intent 验证parseLLMResponse能正确处理所有有效的动作类型，确保智能响应系统支持NEXT/FOLLOWUP/END/STAY四种操作
     */
    it('should handle all valid actions', async () => {
      const module = await import('../src/services/followup.service.js');

      const actions = ['NEXT', 'FOLLOWUP', 'END'];
      for (const action of actions) {
        const json = `{"thinking":"test","action":"${action}","response":"test"}`;
        const result = module.parseLLMResponse(json);
        expect(result?.action).toBe(action);
      }
    });
  });

  describe('generateSmartResponse prompt template', () => {
    it('should have generateSmartResponse template', () => {
      const template = promptService.getTemplate('generateSmartResponse');
      expect(template).toBeDefined();
    });

    it('should have all required variables', () => {
      const template = promptService.getTemplate('generateSmartResponse');
      expect(template?.variables).toContain('conversationHistory');
      expect(template?.variables).toContain('currentQuestion');
      expect(template?.variables).toContain('followupCount');
      expect(template?.variables).toContain('maxFollowups');
      expect(template?.variables).toContain('userAnswer');
    });

    it('should include JSON output format instruction', () => {
      const template = promptService.getTemplate('generateSmartResponse');
      expect(template?.template).toContain('JSON');
      expect(template?.template).toContain('action');
      expect(template?.template).toContain('response');
    });

    it('should include all 9 strategies', () => {
      const template = promptService.getTemplate('generateSmartResponse');
      expect(template?.template).toContain('认真回答');
      expect(template?.template).toContain('敷衍回答');
      expect(template?.template).toContain('困惑不理解');
      expect(template?.template).toContain('拒绝不想答');
      expect(template?.template).toContain('不满情绪激动');
      expect(template?.template).toContain('要求结束');
      expect(template?.template).toContain('要求跳过');
      expect(template?.template).toContain('质疑测试边界');
      expect(template?.template).toContain('转移话题');
    });

    it('should include all 3 action types', () => {
      const template = promptService.getTemplate('generateSmartResponse');
      expect(template?.template).toContain('NEXT');
      expect(template?.template).toContain('FOLLOWUP');
      expect(template?.template).toContain('END');
      expect(template?.template).not.toContain('STAY');
    });

    it('should render correctly with all variables', () => {
      const rendered = promptService.render('generateSmartResponse', {
        conversationHistory: '用户: 你好\n主持人: 欢迎参与',
        currentQuestion: '请介绍一下你的工作经历',
        followupCount: '0',
        maxFollowups: '2',
        userAnswer: '我在科技公司工作了5年',
      });

      expect(rendered).toContain('我在科技公司工作了5年');
      expect(rendered).toContain('请介绍一下你的工作经历');
      expect(rendered).toContain('用户: 你好');
    });
  });

  describe('generateSmartResponse function', () => {
    /**
     * @test REQ-005-5-01
     * @intent 验证导出generateSmartResponse函数，确保智能响应系统的主要功能可用
     */
    it('should export generateSmartResponse function', async () => {
      const module = await import('../src/services/followup.service.js');
      expect(module.generateSmartResponse).toBeDefined();
    });

    /**
     * @test REQ-005-5-02
     * @intent 验证generateSmartResponse返回正确的结构，确保智能响应系统输出包含所有必需字段
     *
     * The contract asserted here is the shape of the result, not the LLM's
     * answer. `fromEnv()` throws without credentials, so the client is stubbed
     * at module scope (inside `it()` a `vi.mock` is still hoisted, which made
     * it rewrite the LLM for every other test in this file — Vitest has
     * deprecated that placement).
     */
    it('should return SmartResponseResult with correct structure', async () => {
      const module = await import('../src/services/followup.service.js');

      const mockState = {
        userId: 'test-user',
        status: 'ACTIVE',
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '欢迎参与访谈' },
        ],
        followupCount: 0,
        maxFollowups: 5,
        responses: [],
        currentQuestion: 0,
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      const result = await module.generateSmartResponse(
        mockState as unknown as InterviewState,
        '我在科技公司工作了5年',
        '请介绍一下你的工作经历'
      );

      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('shouldProceedToNext');
      expect(result).toHaveProperty('shouldEndInterview');
    });
  });

  describe('fallback behavior', () => {
    it('should return fallback when parse fails', async () => {
      const module = await import('../src/services/followup.service.js');

      const fallback = module.FALLBACK_RESPONSE;
      expect(fallback).toBeDefined();
      expect(fallback.length).toBeGreaterThan(0);
    });

    it('should force NEXT when followup limit exceeded', async () => {
      const module = await import('../src/services/followup.service.js');

      // The cap is enforced by generateSmartResponse's pure post-processing, so
      // assert it directly: an LLM FOLLOWUP at the limit must come back as NEXT
      // carrying the forced transition text, never the follow-up phrasing.
      const parsed = {
        thinking: '',
        strategy: 1,
        action: 'FOLLOWUP' as const,
        response: '再问一句？',
      };

      const capped = module.resultFromParsed(parsed, 3, 3, '问二');

      expect(capped.action).toBe('NEXT');
      expect(capped.shouldProceedToNext).toBe(true);
      expect(capped.shouldEndInterview).toBe(false);
      expect(capped.response).not.toBe('再问一句？');
      expect(capped.response).toContain('问二');
    });

    it('should keep FOLLOWUP below the limit', async () => {
      const module = await import('../src/services/followup.service.js');

      const parsed = {
        thinking: '',
        strategy: 1,
        action: 'FOLLOWUP' as const,
        response: '能再多说一点吗？',
      };

      const result = module.resultFromParsed(parsed, 1, 3, '问二');

      expect(result.action).toBe('FOLLOWUP');
      expect(result.response).toBe('能再多说一点吗？');
      expect(result.shouldProceedToNext).toBe(false);
    });
  });
});
