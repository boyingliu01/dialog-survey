/**
 * Shared helpers for `groupBy(status)` count aggregations.
 *
 * `InterviewRepository` and `InterviewPlanServiceBase` both summarise their rows
 * by status for a template; only the Prisma delegate differs. Keeping the
 * collapse-to-`{ counts, total }` logic here means the two stay consistent (and
 * a change to the shape happens in one place).
 */

/** Minimal shape of a Prisma `groupBy(by: ['status'], _count: true)` row. */
export interface StatusGroupRow {
  status: string;
  _count: number | { _all?: number } | null;
}

export interface StatusCounts {
  counts: Record<string, number>;
  total: number;
}

/** Read the grouped row count regardless of whether `_count: true` or `_all` was used. */
function rowCount(row: StatusGroupRow): number {
  if (typeof row._count === 'number') {
    return row._count;
  }
  return row._count?._all ?? 0;
}

/** Collapse `groupBy` rows into a status→count map plus the grand total. */
export function summarizeStatusGroups(rows: StatusGroupRow[]): StatusCounts {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const n = rowCount(row);
    counts[row.status] = n;
    total += n;
  }
  return { counts, total };
}
