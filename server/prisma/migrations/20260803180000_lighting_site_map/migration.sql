-- CreateEnum
CREATE TYPE "LightingSiteMapShapeType" AS ENUM ('NONE', 'CIRCLE', 'POLYGON', 'PATH');

-- CreateTable
CREATE TABLE "LightingSiteMap" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingSiteMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LightingSiteMapDevice" (
    "id" SERIAL NOT NULL,
    "siteMapId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "shapeType" "LightingSiteMapShapeType" NOT NULL DEFAULT 'NONE',
    "shapeData" JSONB,
    "onIcon" TEXT,
    "offIcon" TEXT,
    "onColor" TEXT,
    "offColor" TEXT,
    "zoneOnColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LightingSiteMapDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LightingSiteMapDevice_siteMapId_deviceId_key" ON "LightingSiteMapDevice"("siteMapId", "deviceId");

-- AddForeignKey
ALTER TABLE "LightingSiteMapDevice" ADD CONSTRAINT "LightingSiteMapDevice_siteMapId_fkey" FOREIGN KEY ("siteMapId") REFERENCES "LightingSiteMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LightingSiteMapDevice" ADD CONSTRAINT "LightingSiteMapDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "LightingDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
