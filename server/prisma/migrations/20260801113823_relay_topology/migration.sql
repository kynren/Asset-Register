-- AlterTable
ALTER TABLE "MonitoredNetworkDevice" ADD COLUMN     "snmpLldpNeighbors" JSONB,
ADD COLUMN     "snmpMacTable" JSONB,
ADD COLUMN     "snmpPoeStatus" JSONB,
ADD COLUMN     "snmpSysName" TEXT,
ADD COLUMN     "snmpVlans" JSONB;

-- AlterTable
ALTER TABLE "NetworkEdge" ADD COLUMN     "discoveredVia" TEXT,
ADD COLUMN     "sourcePort" TEXT,
ADD COLUMN     "targetPort" TEXT;

-- CreateTable
CREATE TABLE "RelayDiscoveredSubnet" (
    "id" SERIAL NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelayDiscoveredSubnet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelayDiscoveredSubnet_cidr_key" ON "RelayDiscoveredSubnet"("cidr");
