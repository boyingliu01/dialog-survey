import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AdminSession, validateSession } from '../src/middleware/session-auth.js';

describe('validateSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true for valid session within timeout', () => {
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: Date.now(),
      lastActivity: Date.now(),
    };

    const result = validateSession(session, 28800);

    expect(result).toBe(true);
  });

  it('should return false for expired session', () => {
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: Date.now() - 28801 * 1000,
      lastActivity: Date.now() - 28801 * 1000,
    };

    const result = validateSession(session, 28800);

    expect(result).toBe(false);
  });

  it('should accept a session with an old login and recent activity', () => {
    const now = Date.now();
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: now - 28801 * 1000,
      lastActivity: now - 1000,
    };

    const result = validateSession(session, 28800);

    expect(result).toBe(true);
  });

  it('should reject a session with a recent login and expired activity', () => {
    const now = Date.now();
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: now - 1000,
      lastActivity: now - 28801 * 1000,
    };

    const result = validateSession(session, 28800);

    expect(result).toBe(false);
  });

  it('should update lastActivity for valid session', () => {
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: Date.now() - 3600 * 1000,
      lastActivity: Date.now() - 3600 * 1000,
    };

    const oldLastActivity = session.lastActivity;
    vi.advanceTimersByTime(1000);

    const result = validateSession(session, 28800);

    expect(result).toBe(true);
    expect(session.lastActivity).toBeGreaterThan(oldLastActivity);
  });

  it('should refresh only lastActivity for a valid session', () => {
    const loginTime = Date.now() - 3600 * 1000;
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime,
      lastActivity: Date.now() - 1000,
    };
    vi.advanceTimersByTime(1000);

    const result = validateSession(session, 28800);

    expect(result).toBe(true);
    expect(session.loginTime).toBe(loginTime);
    expect(session.lastActivity).toBe(Date.now());
  });

  it('should not mutate a rejected session', () => {
    const session: AdminSession = {
      userId: 'admin',
      role: 'admin',
      loginTime: Date.now() - 1000,
      lastActivity: Date.now() - 28801 * 1000,
    };
    const originalSession = { ...session };

    const result = validateSession(session, 28800);

    expect(result).toBe(false);
    expect(session).toEqual(originalSession);
  });

  it('should return false for null session', () => {
    const result = validateSession(null, 28800);
    expect(result).toBe(false);
  });

  it('should return false for undefined session', () => {
    const result = validateSession(undefined, 28800);
    expect(result).toBe(false);
  });
});
