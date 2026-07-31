-- CreateEnum
CREATE TYPE "LightingDeviceKind" AS ENUM ('SWITCH', 'LIGHT');

-- CreateTable
CREATE TABLE "LightingDevice" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER,
    "gen" INTEGER,
    "kind" "LightingDeviceKind",
    "channel" INTEGER NOT NULL DEFAULT 0,
    "locationId" INTEGER,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isOn" BOOLEAN NOT NULL DEFAULT false,
    "brightness" INTEGER,
    "powerW" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingDevice_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LightingDevice" ADD CONSTRAINT "LightingDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

