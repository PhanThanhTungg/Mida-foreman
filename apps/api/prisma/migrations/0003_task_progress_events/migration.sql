CREATE TYPE "TaskProgressPhase" AS ENUM (
    'jira_fetch',
    'queued',
    'preflight',
    'understand',
    'plan',
    'code',
    'verify',
    'pr',
    'complete'
);

CREATE TYPE "TaskProgressStatus" AS ENUM (
    'started',
    'completed',
    'failed',
    'skipped',
    'looped'
);

CREATE TABLE "TaskProgressEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "phase" "TaskProgressPhase" NOT NULL,
    "status" "TaskProgressStatus" NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskProgressEvent_taskId_round_createdAt_idx" ON "TaskProgressEvent"("taskId", "round", "createdAt");

ALTER TABLE "TaskProgressEvent" ADD CONSTRAINT "TaskProgressEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
