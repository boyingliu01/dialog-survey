-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING', 'ACTIVE', 'PROCESSING', 'WAITING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchReportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchReportType" AS ENUM ('SUMMARY', 'COMPARISON', 'TREND');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'PENDING',
    "currentQuestion" INTEGER NOT NULL DEFAULT 0,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "maxFollowups" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sendStatus" "SendStatus" NOT NULL DEFAULT 'NOT_SENT',
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reportPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nudgeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isFollowup" BOOLEAN NOT NULL DEFAULT false,
    "followupDepth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "dimensions" JSONB,
    "analysisConfig" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "updatedBy" TEXT NOT NULL DEFAULT 'admin',

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" "PlanStatus" NOT NULL DEFAULT 'PENDING',
    "schedule" TEXT,
    "inviteeData" JSONB,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "sendStatus" "SendStatus" NOT NULL DEFAULT 'NOT_SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "updatedBy" TEXT NOT NULL DEFAULT 'admin',

    CONSTRAINT "InterviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keyFindings" TEXT[],
    "sentiment" TEXT,
    "recommendations" TEXT[],
    "dimensionTags" JSONB,
    "emergentTags" TEXT[],
    "interviewerRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisFailure" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalysisFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchAnalysisReport" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "BatchReportType" NOT NULL DEFAULT 'SUMMARY',
    "status" "BatchReportStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "topics" JSONB NOT NULL,
    "emergents" JSONB NOT NULL,
    "checkpoint" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "updatedBy" TEXT NOT NULL DEFAULT 'admin',

    CONSTRAINT "BatchAnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "userId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_userId_idx" ON "Interview"("userId");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "Interview_planId_idx" ON "Interview"("planId");

-- CreateIndex
CREATE INDEX "AnalysisFailure_retried_idx" ON "AnalysisFailure"("retried");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisFailure_interviewId_errorType_key" ON "AnalysisFailure"("interviewId", "errorType");

-- CreateIndex
CREATE INDEX "BatchAnalysisReport_planId_status_createdAt_idx" ON "BatchAnalysisReport"("planId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_expiresAt_idx" ON "AuditLog"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_revoked_idx" ON "ApiKey"("revoked");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPlan" ADD CONSTRAINT "InterviewPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAnalysisReport" ADD CONSTRAINT "BatchAnalysisReport_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAnalysisReport" ADD CONSTRAINT "BatchAnalysisReport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

