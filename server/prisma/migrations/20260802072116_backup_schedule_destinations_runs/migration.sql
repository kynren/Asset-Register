-- CreateEnum
CREATE TYPE "BackupDestinationType" AS ENUM ('EMAIL', 'S3');

-- CreateEnum
CREATE TYPE "BackupRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "BackupSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timeOfDay" TEXT NOT NULL DEFAULT '02:00',
    "lastRunDate" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupDestination" (
    "id" SERIAL NOT NULL,
    "type" "BackupDestinationType" NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailTo" TEXT,
    "s3Endpoint" TEXT,
    "s3Region" TEXT,
    "s3Bucket" TEXT,
    "s3AccessKeyId" TEXT,
    "s3SecretAccessKey" TEXT,
    "s3PathPrefix" TEXT,
    "s3ForcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" SERIAL NOT NULL,
    "trigger" "BackupRunTrigger" NOT NULL,
    "status" "BackupRunStatus" NOT NULL DEFAULT 'RUNNING',
    "fileSizeBytes" INTEGER,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRunDestination" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "destinationId" INTEGER,
    "destinationName" TEXT NOT NULL,
    "destinationType" "BackupDestinationType" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,

    CONSTRAINT "BackupRunDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");

-- CreateIndex
CREATE INDEX "BackupRunDestination_runId_idx" ON "BackupRunDestination"("runId");

-- AddForeignKey
ALTER TABLE "BackupSettings" ADD CONSTRAINT "BackupSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRunDestination" ADD CONSTRAINT "BackupRunDestination_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BackupRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRunDestination" ADD CONSTRAINT "BackupRunDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "BackupDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
