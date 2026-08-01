-- CreateEnum
CREATE TYPE "PersonGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "LightingAutomationActionType" AS ENUM ('DEVICE', 'SCENE');

-- CreateEnum
CREATE TYPE "ZigbeeModule" AS ENUM ('LIGHTING', 'ACCESS_CONTROL');

-- CreateEnum
CREATE TYPE "ZigbeeCoordinatorStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ZigbeeDeviceType" AS ENUM ('CONTACT_SENSOR', 'LOCK', 'MOTION_SENSOR', 'OTHER');

-- AlterEnum
ALTER TYPE "LightingProtocol" ADD VALUE 'ZIGBEE';

-- DropForeignKey
ALTER TABLE "AccessCredential" DROP CONSTRAINT "AccessCredential_userId_fkey";

-- AlterTable
ALTER TABLE "AccessCredential" DROP COLUMN "userId",
ADD COLUMN     "personId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "LightingDevice" ADD COLUMN     "groupId" INTEGER,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "zigbeeIeeeAddress" TEXT,
ADD COLUMN     "zigbeeNetworkAddress" INTEGER;

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "PersonGender" NOT NULL DEFAULT 'MALE',
    "email" TEXT,
    "phone" TEXT,
    "organizationId" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "longTermEffective" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCard" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "cardType" TEXT NOT NULL DEFAULT 'Normal Card',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "planTemplateNo" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGroupMember" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,

    CONSTRAINT "AccessGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGroupDoor" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "doorId" INTEGER NOT NULL,

    CONSTRAINT "AccessGroupDoor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingScene" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingSceneAction" (
    "id" SERIAL NOT NULL,
    "sceneId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "turnOn" BOOLEAN NOT NULL,
    "brightness" INTEGER,

    CONSTRAINT "LightingSceneAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingAutomation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" INTEGER[],
    "timeOfDay" TEXT NOT NULL,
    "actionType" "LightingAutomationActionType" NOT NULL,
    "targetDeviceId" INTEGER,
    "targetSceneId" INTEGER,
    "turnOn" BOOLEAN,
    "lastRunDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LightingAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZigbeeCoordinator" (
    "id" SERIAL NOT NULL,
    "module" "ZigbeeModule" NOT NULL,
    "serialPort" TEXT,
    "status" "ZigbeeCoordinatorStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastError" TEXT,
    "panId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZigbeeCoordinator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZigbeeDevice" (
    "id" SERIAL NOT NULL,
    "module" "ZigbeeModule" NOT NULL,
    "ieeeAddress" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "deviceType" "ZigbeeDeviceType" NOT NULL DEFAULT 'OTHER',
    "isOn" BOOLEAN,
    "contactOpen" BOOLEAN,
    "batteryPct" INTEGER,
    "lastSeenAt" TIMESTAMP(3),
    "locationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZigbeeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_personId_key" ON "Person"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonCard_cardNumber_key" ON "PersonCard"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroupMember_groupId_personId_key" ON "AccessGroupMember"("groupId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroupDoor_groupId_doorId_key" ON "AccessGroupDoor"("groupId", "doorId");

-- CreateIndex
CREATE UNIQUE INDEX "LightingSceneAction_sceneId_deviceId_key" ON "LightingSceneAction"("sceneId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ZigbeeCoordinator_module_key" ON "ZigbeeCoordinator"("module");

-- CreateIndex
CREATE UNIQUE INDEX "ZigbeeDevice_ieeeAddress_key" ON "ZigbeeDevice"("ieeeAddress");

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCard" ADD CONSTRAINT "PersonCard_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGroupMember" ADD CONSTRAINT "AccessGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGroupMember" ADD CONSTRAINT "AccessGroupMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGroupDoor" ADD CONSTRAINT "AccessGroupDoor_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGroupDoor" ADD CONSTRAINT "AccessGroupDoor_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "Door"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingDevice" ADD CONSTRAINT "LightingDevice_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LightingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingSceneAction" ADD CONSTRAINT "LightingSceneAction_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "LightingScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingSceneAction" ADD CONSTRAINT "LightingSceneAction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "LightingDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingAutomation" ADD CONSTRAINT "LightingAutomation_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "LightingDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingAutomation" ADD CONSTRAINT "LightingAutomation_targetSceneId_fkey" FOREIGN KEY ("targetSceneId") REFERENCES "LightingScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZigbeeDevice" ADD CONSTRAINT "ZigbeeDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

