import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOSING_MESSAGE,
  DEFAULT_MAX_FOLLOWUPS,
  DEFAULT_TEMPLATE_CONTENT,
  InterviewStateSchema,
} from '../src/core/types/index.js';

/**
 * @test REQ-155-STATE-SCHEMA
 * @intent 为 InterviewStateSchema 的枚举与默认值建立契约测试，避免 schema 声明被悄悄改坏而无人发现
 * @covers status/role 枚举的每一个合法值及其拒绝的非法值、各字段默认值、followupDepth 的可选兼容
 *
 * Gate M had this file at 25.7% — with only 35 mutants total, all of them enum
 * string literals. A schema is a *declaration*, and nothing asserted it, so
 * changing `'CANCELLED'` to `'CANCELED'` would pass the whole suite while
 * silently rejecting the states already in the database. These tests make the
 * declaration itself the contract.
 */

/**
 * `responses` is required — it has no `.default([])` unlike the pending lists,
 * which is worth knowing: a caller building a state by hand gets a validation
 * error rather than a silently missing array.
 */
const minimal = { userId: 'u1', messages: [], responses: [] };

describe('InterviewStateSchema', () => {
  describe('status enum', () => {
    it.each(['PENDING', 'ACTIVE', 'PROCESSING', 'WAITING', 'COMPLETED', 'CANCELLED'])(
      'accepts %s',
      (status) => {
        expect(InterviewStateSchema.safeParse({ ...minimal, status }).success).toBe(true);
      }
    );

    it.each(['pending', 'DONE', 'CANCELED', ''])('rejects %s', (status) => {
      expect(InterviewStateSchema.safeParse({ ...minimal, status }).success).toBe(false);
    });

    it('defaults to PENDING', () => {
      expect(InterviewStateSchema.parse(minimal).status).toBe('PENDING');
    });
  });

  describe('message role enum', () => {
    it.each(['user', 'assistant', 'system'])('accepts %s', (role) => {
      const result = InterviewStateSchema.safeParse({
        ...minimal,
        messages: [{ role, content: 'hi' }],
      });
      expect(result.success).toBe(true);
    });

    it.each(['bot', 'human', 'USER', ''])('rejects %s', (role) => {
      const result = InterviewStateSchema.safeParse({
        ...minimal,
        messages: [{ role, content: 'hi' }],
      });
      expect(result.success).toBe(false);
    });

    it('applies the same enum to pendingMessages', () => {
      const ok = InterviewStateSchema.safeParse({
        ...minimal,
        pendingMessages: [{ role: 'assistant', content: 'hi' }],
      });
      const bad = InterviewStateSchema.safeParse({
        ...minimal,
        pendingMessages: [{ role: 'bot', content: 'hi' }],
      });

      expect(ok.success).toBe(true);
      expect(bad.success).toBe(false);
    });
  });

  describe('defaults', () => {
    it('fills in every documented default', () => {
      const state = InterviewStateSchema.parse(minimal);

      expect(state.currentQuestion).toBe(0);
      expect(state.followupCount).toBe(0);
      expect(state.maxFollowups).toBe(DEFAULT_MAX_FOLLOWUPS);
      expect(state.reportGenerated).toBe(false);
      expect(state.nudgeCount).toBe(0);
      expect(state.version).toBe(1);
      expect(state.originalVersion).toBe(1);
      expect(state.pendingMessages).toEqual([]);
      expect(state.pendingResponses).toEqual([]);
    });

    it('keeps DEFAULT_MAX_FOLLOWUPS at the documented value', () => {
      // Pinned deliberately: raising this silently lengthens every interview.
      expect(DEFAULT_MAX_FOLLOWUPS).toBe(5);
    });

    it('keeps the closing message as the documented copy', () => {
      expect(DEFAULT_CLOSING_MESSAGE).toContain('访谈已结束');
      expect(DEFAULT_CLOSING_MESSAGE).toContain('非常感谢');
    });

    it('defaults isFollowup to false for answers', () => {
      const state = InterviewStateSchema.parse({
        ...minimal,
        responses: [{ questionId: 'q1', content: 'a' }],
      });

      expect(state.responses[0]?.isFollowup).toBe(false);
    });
  });

  describe('followupDepth back-compatibility', () => {
    it('accepts a response without followupDepth', () => {
      const result = InterviewStateSchema.safeParse({
        ...minimal,
        responses: [{ questionId: 'q1', content: 'a' }],
      });

      expect(result.success).toBe(true);
    });

    it('accepts a response carrying a depth', () => {
      const state = InterviewStateSchema.parse({
        ...minimal,
        responses: [{ questionId: 'q1', content: 'a', followupDepth: 2 }],
      });

      expect(state.responses[0]?.followupDepth).toBe(2);
    });

    it('accepts a pending response carrying a depth', () => {
      const state = InterviewStateSchema.parse({
        ...minimal,
        pendingResponses: [{ questionId: 'q1', content: 'a', followupDepth: 1 }],
      });

      expect(state.pendingResponses[0]?.followupDepth).toBe(1);
    });

    it('rejects a non-numeric depth', () => {
      const result = InterviewStateSchema.safeParse({
        ...minimal,
        responses: [{ questionId: 'q1', content: 'a', followupDepth: 'deep' }],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('required fields', () => {
    it('requires userId', () => {
      expect(InterviewStateSchema.safeParse({ messages: [] }).success).toBe(false);
    });

    it('requires messages', () => {
      expect(InterviewStateSchema.safeParse({ userId: 'u1' }).success).toBe(false);
    });

    it('accepts the optional identifiers being absent', () => {
      const result = InterviewStateSchema.safeParse(minimal);

      expect(result.success).toBe(true);
    });

    it('accepts templateId, interviewId and userName when present', () => {
      const result = InterviewStateSchema.safeParse({
        ...minimal,
        templateId: 't1',
        interviewId: 'iv1',
        userName: '张三',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('DEFAULT_TEMPLATE_CONTENT', () => {
  it('carries a name so the greeting never interpolates undefined', () => {
    expect(DEFAULT_TEMPLATE_CONTENT.name).toBeTruthy();
  });

  it('carries a non-empty invitation prompt', () => {
    expect(DEFAULT_TEMPLATE_CONTENT.invitationPrompt.length).toBeGreaterThan(0);
  });

  it('ships at least one question', () => {
    expect(DEFAULT_TEMPLATE_CONTENT.questions.length).toBeGreaterThan(0);
    for (const q of DEFAULT_TEMPLATE_CONTENT.questions) {
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(0);
    }
  });
});
