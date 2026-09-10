import { describe, expect, it } from 'vitest';
import { createLoginRateLimiter } from '../src/utils/security.js';

describe('createLoginRateLimiter', () => {
  it('blocks an IP once failures reach the configured maximum within the window', () => {
    const now = 1_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);
  });

  it('unblocks an IP after the failure window expires', () => {
    let now = 1_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 2,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);

    now = 1_000 + 60_001;
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('starts a fresh window for failures recorded after expiry', () => {
    let now = 1_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 2,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.recordFailure('1.2.3.4');
    now = 1_000 + 60_001;
    limiter.recordFailure('1.2.3.4');

    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('clears failures for an IP on reset', () => {
    const now = 1_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 2,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);

    limiter.reset('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('tracks IPs independently', () => {
    const now = 1_000;
    const limiter = createLoginRateLimiter({
      maxFailures: 2,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.recordFailure('1.1.1.1');
    limiter.recordFailure('1.1.1.1');

    expect(limiter.isBlocked('1.1.1.1')).toBe(true);
    expect(limiter.isBlocked('2.2.2.2')).toBe(false);
  });
});
