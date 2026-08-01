-- CreateEnum
CREATE TYPE "LightingAutomationRunTrigger" AS ENUM ('ON', 'OFF');

-- CreateEnum
CREATE TYPE "LightingAutomationRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "NetworkMonitorSettings" ADD COLUMN     "notifyEmails" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "notifyUserIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "LightingAutomationRun" (
    "id" SERIAL NOT NULL,
    "automationId" INTEGER,
    "automationName" TEXT NOT NULL,
    "trigger" "LightingAutomationRunTrigger" NOT NULL,
    "status" "LightingAutomationRunStatus" NOT NULL,
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CameraToDoor" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "LightingAutomationRun_ranAt_idx" ON "LightingAutomationRun"("ranAt");

-- CreateIndex
CREATE INDEX "LightingAutomationRun_automationId_idx" ON "LightingAutomationRun"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "_CameraToDoor_AB_unique" ON "_CameraToDoor"("A", "B");

-- CreateIndex
CREATE INDEX "_CameraToDoor_B_index" ON "_CameraToDoor"("B");

-- AddForeignKey
ALTER TABLE "LightingAutomationRun" ADD CONSTRAINT "LightingAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "LightingAutomation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CameraToDoor" ADD CONSTRAINT "_CameraToDoor_A_fkey" FOREIGN KEY ("A") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CameraToDoor" ADD CONSTRAINT "_CameraToDoor_B_fkey" FOREIGN KEY ("B") REFERENCES "Door"("id") ON DELETE CASCADE ON UPDATE CASCADE;
