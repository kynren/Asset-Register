-- CreateEnum
CREATE TYPE "ScheduledChangeType" AS ENUM ('SYSTEM_SETTINGS', 'BACKUP_SETTINGS', 'ROLE_PERMISSIONS');

-- CreateEnum
CREATE TYPE "ScheduledChangeStatus" AS ENUM ('PENDING', 'PUBLISHED', 'CANCELLED', 'FAILED');

-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables here — those are the multi-tenant control plane's raw-SQL tables (see
-- config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in schema.prisma
-- since they're shared across every tenant schema and managed outside Prisma. Those DROP
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.

-- CreateTable
CREATE TABLE "ScheduledChange" (
    "id" SERIAL NOT NULL,
    "changeType" "ScheduledChangeType" NOT NULL,
    "status" "ScheduledChangeStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "beforeSnapshot" JSONB,
    "targetId" INTEGER,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledChange_status_scheduledFor_idx" ON "ScheduledChange"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledChange_changeType_targetId_idx" ON "ScheduledChange"("changeType", "targetId");

-- AddForeignKey
ALTER TABLE "ScheduledChange" ADD CONSTRAINT "ScheduledChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledChange" ADD CONSTRAINT "ScheduledChange_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

