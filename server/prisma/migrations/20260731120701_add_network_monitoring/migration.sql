-- CreateEnum
CREATE TYPE "NetworkScanTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "DeviceLiveStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailEventType" ADD VALUE 'DEVICE_OFFLINE';
ALTER TYPE "EmailEventType" ADD VALUE 'DEVICE_ONLINE';

-- DropForeignKey
ALTER TABLE "NetworkScan" DROP CONSTRAINT "NetworkScan_startedById_fkey";

-- AlterTable
ALTER TABLE "NetworkScan" ADD COLUMN     "triggeredBy" "NetworkScanTrigger" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "startedById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "NetworkMonitorSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "ranges" JSONB NOT NULL DEFAULT '[]',
    "lastRunAt" TIMESTAMP(3),
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkMonitorSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredNetworkDevice" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "hostname" TEXT,
    "vendor" TEXT,
    "deviceType" TEXT,
    "status" "DeviceLiveStatus" NOT NULL DEFAULT 'ONLINE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snmpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "snmpCommunity" TEXT,
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "snmpSysDescr" TEXT,
    "snmpUpTimeTicks" BIGINT,
    "snmpInterfaces" JSONB,
    "snmpLastPolledAt" TIMESTAMP(3),
    "snmpLastError" TEXT,

    CONSTRAINT "MonitoredNetworkDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkDeviceStatusEvent" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "status" "DeviceLiveStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkDeviceStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredNetworkDevice_key_key" ON "MonitoredNetworkDevice"("key");

-- CreateIndex
CREATE INDEX "NetworkDeviceStatusEvent_deviceId_occurredAt_idx" ON "NetworkDeviceStatusEvent"("deviceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "NetworkScan" ADD CONSTRAINT "NetworkScan_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMonitorSettings" ADD CONSTRAINT "NetworkMonitorSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkDeviceStatusEvent" ADD CONSTRAINT "NetworkDeviceStatusEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoredNetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
