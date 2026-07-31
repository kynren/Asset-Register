-- CreateEnum
CREATE TYPE "LightingScanStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "LightingScan" (
    "id" SERIAL NOT NULL,
    "startIp" TEXT NOT NULL,
    "endIp" TEXT NOT NULL,
    "status" "LightingScanStatus" NOT NULL DEFAULT 'RUNNING',
    "totalHosts" INTEGER NOT NULL,
    "scannedHosts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LightingScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingScanResult" (
    "id" SERIAL NOT NULL,
    "scanId" INTEGER NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "name" TEXT,
    "model" TEXT,
    "gen" INTEGER,
    "alreadyAdded" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingScanResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LightingScanResult" ADD CONSTRAINT "LightingScanResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "LightingScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

