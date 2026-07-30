-- CreateEnum
CREATE TYPE "PortStatus" AS ENUM ('UP', 'DOWN', 'DISABLED');

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "isSwitchingDevice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SwitchPort" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "portNumber" INTEGER NOT NULL,
    "label" TEXT,
    "status" "PortStatus" NOT NULL DEFAULT 'DOWN',
    "vlan" TEXT,
    "connectedAssetId" INTEGER,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwitchPort_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SwitchPort_assetId_portNumber_key" ON "SwitchPort"("assetId", "portNumber");

-- AddForeignKey
ALTER TABLE "SwitchPort" ADD CONSTRAINT "SwitchPort_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwitchPort" ADD CONSTRAINT "SwitchPort_connectedAssetId_fkey" FOREIGN KEY ("connectedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
