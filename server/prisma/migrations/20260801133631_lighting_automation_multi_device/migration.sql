/*
  Warnings:

  - You are about to drop the column `targetDeviceId` on the `LightingAutomation` table. All the data in the column will be lost.
  - You are about to drop the column `turnOn` on the `LightingAutomation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "LightingAutomation" DROP CONSTRAINT "LightingAutomation_targetDeviceId_fkey";

-- AlterTable
ALTER TABLE "LightingAutomation" DROP COLUMN "targetDeviceId",
DROP COLUMN "turnOn";

-- CreateTable
CREATE TABLE "LightingAutomationAction" (
    "id" SERIAL NOT NULL,
    "automationId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "turnOn" BOOLEAN NOT NULL,
    "brightness" INTEGER,

    CONSTRAINT "LightingAutomationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LightingAutomationAction_automationId_deviceId_key" ON "LightingAutomationAction"("automationId", "deviceId");

-- AddForeignKey
ALTER TABLE "LightingAutomationAction" ADD CONSTRAINT "LightingAutomationAction_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "LightingAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingAutomationAction" ADD CONSTRAINT "LightingAutomationAction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "LightingDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
