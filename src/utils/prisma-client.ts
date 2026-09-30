/**
 * Prisma symbol facade — the single import path for all Prisma-generated symbols.
 *
 * Pure re-export: module evaluation has zero side effects (no env reads, no
 * client construction). Every consumer (src, tests, prisma seeds, scripts)
 * imports Prisma symbols from here — never from `@prisma/client` or
 * `src/generated/prisma` directly (type identity, design DD-003).
 *
 * Symbols: PrismaClient · InterviewStatus · SendStatus · TemplateStatus ·
 * PlanStatus · BatchReportStatus · BatchReportType · Prisma.* namespace ·
 * model types.
 */
export * from '../generated/prisma/client.js';
