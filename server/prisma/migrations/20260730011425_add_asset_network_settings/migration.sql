-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "defaultGateway" TEXT,
ADD COLUMN     "dnsServers" TEXT,
ADD COLUMN     "staticIpAddress" TEXT,
ADD COLUMN     "subnetMask" TEXT;
