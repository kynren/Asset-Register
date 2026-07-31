-- CreateEnum
CREATE TYPE "DoorLockState" AS ENUM ('LOCKED', 'UNLOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccessCredentialStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "AccessControlDevice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "locationId" INTEGER,
    "model" TEXT,
    "notes" TEXT,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastEventSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessControlDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Door" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "doorNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lockState" "DoorLockState" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Door_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCredential" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "cardNumber" TEXT,
    "hasPin" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccessCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "doorId" INTEGER,
    "employeeNo" TEXT,
    "cardNumber" TEXT,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Door_deviceId_doorNumber_key" ON "Door"("deviceId", "doorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccessCredential_deviceId_employeeNo_key" ON "AccessCredential"("deviceId", "employeeNo");

-- AddForeignKey
ALTER TABLE "AccessControlDevice" ADD CONSTRAINT "AccessControlDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Door" ADD CONSTRAINT "Door_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessControlDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessControlDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessControlDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "Door"("id") ON DELETE SET NULL ON UPDATE CASCADE;

