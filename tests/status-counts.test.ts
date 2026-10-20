import { describe, expect, it } from 'vitest';
import { summarizeStatusGroups } from '../src/repositories/status-counts.js';

describe('summarizeStatusGroups', () => {
  it('collapses groupBy rows into a status→count map plus total', () => {
    const rows = [
      { status: 'PENDING', _count: 3 },
      { status: 'COMPLETED', _count: 5 },
    ];

    expect(summarizeStatusGroups(rows)).toEqual({
      counts: { PENDING: 3, COMPLETED: 5 },
      total: 8,
    });
  });

  it('reads the count from an _all object form', () => {
    // Prisma returns either a bare number or `{ _all: n }` depending on the
    // select used; both must yield the same summary.
    const rows = [
      { status: 'PENDING', _count: { _all: 4 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ];

    expect(summarizeStatusGroups(rows)).toEqual({
      counts: { PENDING: 4, FAILED: 1 },
      total: 5,
    });
  });

  it('treats a null or empty _count as zero', () => {
    const rows = [
      { status: 'PENDING', _count: null },
      { status: 'COMPLETED', _count: {} },
    ];

    expect(summarizeStatusGroups(rows)).toEqual({
      counts: { PENDING: 0, COMPLETED: 0 },
      total: 0,
    });
  });

  it('returns an empty summary for no rows', () => {
    expect(summarizeStatusGroups([])).toEqual({ counts: {}, total: 0 });
  });

  it('sums a single status correctly', () => {
    expect(summarizeStatusGroups([{ status: 'SENT', _count: 7 }])).toEqual({
      counts: { SENT: 7 },
      total: 7,
    });
  });
});
