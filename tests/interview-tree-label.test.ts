import { describe, expect, it } from 'vitest';
import { findInviteeInfo, interviewTreeLabel } from '../src/api/admin/view-models.js';

/**
 * Issue #223 — the admin tree rendered `interview.userId` alone, so an
 * administrator saw a column of numeric DingTalk ids and could not tell who was
 * who. The label builder must add the invitee's name and phone when the plan's
 * imported `inviteeData` knows them, and must degrade in two steps rather than
 * printing an empty segment.
 */
describe('interviewTreeLabel (issue #223)', () => {
  it('renders name-phone-userId when both are known', () => {
    expect(interviewTreeLabel({ name: '张三', phone: '13800001111' }, 'user-123')).toBe(
      '张三-13800001111-user-123'
    );
  });

  it('renders name-userId when the invitee has no phone', () => {
    expect(interviewTreeLabel({ name: '张三' }, 'user-123')).toBe('张三-user-123');
  });

  it('renders the bare userId when no invitee info is known', () => {
    expect(interviewTreeLabel({}, 'user-123')).toBe('user-123');
  });

  it('renders the bare userId when the name is an empty string', () => {
    expect(interviewTreeLabel({ name: '', phone: '13800001111' }, 'user-123')).toBe('user-123');
  });

  it('renders name-userId when the phone is an empty string (blank CSV cell)', () => {
    expect(interviewTreeLabel({ name: '张三', phone: '' }, 'user-123')).toBe('张三-user-123');
  });

  it('treats whitespace-only fields as absent', () => {
    expect(interviewTreeLabel({ name: '   ', phone: '  ' }, 'user-123')).toBe('user-123');
    expect(interviewTreeLabel({ name: '张三', phone: '   ' }, 'user-123')).toBe('张三-user-123');
  });

  it('trims surrounding whitespace from name and phone', () => {
    expect(interviewTreeLabel({ name: ' 张三 ', phone: ' 13800001111 ' }, 'user-123')).toBe(
      '张三-13800001111-user-123'
    );
  });

  it('keeps a userId that is empty rather than emitting separators', () => {
    expect(interviewTreeLabel({ name: '张三', phone: '13800001111' }, '')).toBe(
      '张三-13800001111-'
    );
  });
});

describe('findInviteeInfo feeding interviewTreeLabel', () => {
  const inviteeData = [
    { userId: 'user-1', name: '李四', phone: '13900002222' },
    { userId: 'user-2', name: '王五' },
    { userId: 'user-3' },
  ];

  it('composes name-phone-userId for a fully populated invitee', () => {
    const info = findInviteeInfo(inviteeData, 'user-1');
    expect(interviewTreeLabel(info, 'user-1')).toBe('李四-13900002222-user-1');
  });

  it('composes name-userId when the imported row has no phone', () => {
    const info = findInviteeInfo(inviteeData, 'user-2');
    expect(interviewTreeLabel(info, 'user-2')).toBe('王五-user-2');
  });

  it('falls back to the bare userId when the row has no name', () => {
    const info = findInviteeInfo(inviteeData, 'user-3');
    expect(interviewTreeLabel(info, 'user-3')).toBe('user-3');
  });

  it('falls back to the bare userId when the userId is not in the plan', () => {
    const info = findInviteeInfo(inviteeData, 'user-unknown');
    expect(interviewTreeLabel(info, 'user-unknown')).toBe('user-unknown');
  });

  it('falls back to the bare userId when inviteeData is null', () => {
    const info = findInviteeInfo(null, 'user-1');
    expect(interviewTreeLabel(info, 'user-1')).toBe('user-1');
  });
});
