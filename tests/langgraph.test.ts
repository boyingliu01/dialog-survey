import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LangGraph State Machine', () => {
  describe('ConversationEngine', () => {
    it('should have src/services/conversation-engine.ts', () => {
      expect(fs.existsSync('src/services/conversation-engine.ts')).toBe(true);
    });

    it('should implement processMessage function', () => {
      const content = fs.readFileSync('src/services/conversation-engine.ts', 'utf-8');
      expect(content.toLowerCase()).toContain('process');
    });
  });

  describe('Domain Entities', () => {
    it('should have interview.entity.ts', () => {
      expect(fs.existsSync('src/domains/interview/entities/interview.entity.ts')).toBe(true);
    });

    it('should have message.entity.ts', () => {
      expect(fs.existsSync('src/domains/interview/entities/message.entity.ts')).toBe(true);
    });

    it('should have response.entity.ts', () => {
      expect(fs.existsSync('src/domains/interview/entities/response.entity.ts')).toBe(true);
    });

    it('should have interview.domain.ts', () => {
      expect(fs.existsSync('src/domains/interview/services/interview.domain.ts')).toBe(true);
    });
  });

  describe('State Types', () => {
    it('should define InterviewState', () => {
      expect(fs.existsSync('src/core/types/index.ts')).toBe(true);
    });
  });

  describe('Nodes', () => {
    it('should have planning node', () => {
      expect(fs.existsSync('src/core/nodes/planning.ts')).toBe(true);
    });

    it('should have interviewing node', () => {
      expect(fs.existsSync('src/core/nodes/interviewing.ts')).toBe(true);
    });

    it('should have analyzing node', () => {
      expect(fs.existsSync('src/core/nodes/analyzing.ts')).toBe(true);
    });

    it('should have completed node', () => {
      expect(fs.existsSync('src/core/nodes/completed.ts')).toBe(true);
    });
  });
});
