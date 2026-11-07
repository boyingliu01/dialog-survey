-- Issue #232: interviews that were abandoned mid-conversation had no terminal state.
--
-- Abandoned interviews sat in ACTIVE forever, which made them indistinguishable from
-- "currently in progress": plan completion never fired, the member-conflict check
-- permanently blocked re-interviewing that person, and analytics lumped a 48-minute
-- conversation that stopped at question 4 together with interviews nobody had opened.
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';
