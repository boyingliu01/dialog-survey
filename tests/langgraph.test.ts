import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LangGraph State Machine', () => {
  describe('ConversationEngine (Deleted)', () => {
    /**
     * @test REFACTOR-M1
     * @intent ConversationEngine deleted as dead code (issue #115)
     */
    it('should have removed src/services/conversation-engine.ts', () => {
      expect(fs.existsSync('src/services/conversation-engine.ts')).toBe(false);
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
     * @test REFACTOR-C2
     * @intent 验证Analyzing节点已删除(功能内联到graph.ts, issue #109)
     */
    it('should have removed analyzing node (inlined into graph.ts)', () => {
      expect(fs.existsSync('src/core/nodes/analyzing.ts')).toBe(false);
    });

    /**
     * @test REFACTOR-C2
     * @intent 验证Completed节点已删除(功能内联到graph.ts, issue #109)
     */
    it('should have removed completed node (inlined into graph.ts)', () => {
      expect(fs.existsSync('src/core/nodes/completed.ts')).toBe(false);
    });
  });
});
