-- CreateEnum
CREATE TYPE "RelayVideoJobKind" AS ENUM ('LIVE', 'RECORDING');

-- CreateEnum
CREATE TYPE "RelayVideoJobStatus" AS ENUM ('PENDING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED');

-- CreateTable
CREATE TABLE "RelayVideoJob" (
    "id" TEXT NOT NULL,
    "kind" "RelayVideoJobKind" NOT NULL,
    "streamUrl" TEXT NOT NULL,
    "status" "RelayVideoJobStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelayVideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelayVideoJob_status_idx" ON "RelayVideoJob"("status");
