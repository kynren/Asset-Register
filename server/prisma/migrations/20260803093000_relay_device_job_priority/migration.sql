-- AlterTable
ALTER TABLE "RelayDeviceJob" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "RelayDeviceJob_status_createdAt_idx";

-- CreateIndex
CREATE INDEX "RelayDeviceJob_status_priority_createdAt_idx" ON "RelayDeviceJob"("status", "priority", "createdAt");
