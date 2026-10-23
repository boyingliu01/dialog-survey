-- Drop `InterviewPlan.completedCount`.
--
-- Nothing ever wrote this column: `sentCount` and `failedCount` both have
-- increment/decrement paths in interview-plan-send.service.ts and
-- interview-plan-members.service.ts, but `completedCount` had none, so it sat
-- at its default 0 forever. Every reader already computes the number from the
-- interviews relation instead (`admin-templates.ts` counts
-- `p.interviews.filter(status === 'COMPLETED')`, `analytics.service.ts` does the
-- same), so the admin UI was showing the correct value while the stored field
-- disagreed.
--
-- Keeping it would mean keeping a field that is guaranteed to be stale —
-- a trap for the next report, export or integration that reads the column
-- instead of the relation. "A plan is complete" stays expressible as a query
-- over its interviews, which cannot drift.
--
-- See issue #202.

-- AlterTable
ALTER TABLE "InterviewPlan" DROP COLUMN "completedCount";
