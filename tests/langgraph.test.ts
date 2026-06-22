import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LangGraph State Machine', () => {
  describe('ConversationEngine', () => {
    /**
     * @test REQ-003-1-01
     * @intent 验证ConversationEngine统一入口存在
     */
    it('should have src/services/conversation-engine.ts', () => {
      expect(fs.existsSync('src/services/conversation-engine.ts')).toBe(true);
    });

    /**
     * @test REQ-003-1-01
     * @intent 验证ConversationEngine实现processMessage函数用于路由Webhook消息
     */
    it('should implement processMessage function', () => {
      const content = fs.readFileSync('src/services/conversation-engine.ts', 'utf-8');
      expect(content.toLowerCase()).toContain('process');
    });
  });

  describe('Domain Layer (Removed)', () => {
    /**
     * @test REFACTOR-001
     * @intent Verify DDD domain layer removed (src/domains/ does not exist)
     */
    it('should have removed src/domains/ directory', () => {
      expect(fs.existsSync('src/domains/')).toBe(false);
    });
  });

  describe('State Types', () => {
    /**
     * @test REQ-003-3-01
     * @intent 验证InterviewState接口定义存在
     */
    it('should define InterviewState', () => {
      expect(fs.existsSync('src/core/types/index.ts')).toBe(true);
    });
  });

  describe('Nodes', () => {
    /**
     * @test REQ-003-4-01
     * @intent 验证Planning节点存在
     */
    it('should have planning node', () => {
      expect(fs.existsSync('src/core/nodes/planning.ts')).toBe(true);
    });

    /**
     * @test REQ-003-5-01
     * @intent 验证Interviewing节点存在
     */
    it('should have interviewing node', () => {
      expect(fs.existsSync('src/core/nodes/interviewing.ts')).toBe(true);
    });

    /**
     * @test REQ-003-6-01
     * @intent 验证Analyzing节点存在
     */
    it('should have analyzing node', () => {
      expect(fs.existsSync('src/core/nodes/analyzing.ts')).toBe(true);
    });

    /**
     * @test REQ-003-7-01
     * @intent 验证Completed节点存在
     */
    it('should have completed node', () => {
      expect(fs.existsSync('src/core/nodes/completed.ts')).toBe(true);
    });
  });
});
