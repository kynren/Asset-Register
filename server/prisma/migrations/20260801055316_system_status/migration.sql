-- CreateEnum
CREATE TYPE "SystemComponentStatus" AS ENUM ('OPERATIONAL', 'DEGRADED', 'OUTAGE');

-- CreateTable
CREATE TABLE "SystemComponent" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemComponentDailyStatus" (
    "id" SERIAL NOT NULL,
    "componentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "SystemComponentStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "checksOk" INTEGER NOT NULL DEFAULT 0,
    "checksTotal" INTEGER NOT NULL DEFAULT 0,
    "lastMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemComponentDailyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemComponent_key_key" ON "SystemComponent"("key");

-- CreateIndex
CREATE INDEX "SystemComponentDailyStatus_date_idx" ON "SystemComponentDailyStatus"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SystemComponentDailyStatus_componentId_date_key" ON "SystemComponentDailyStatus"("componentId", "date");

-- AddForeignKey
ALTER TABLE "SystemComponentDailyStatus" ADD CONSTRAINT "SystemComponentDailyStatus_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "SystemComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
