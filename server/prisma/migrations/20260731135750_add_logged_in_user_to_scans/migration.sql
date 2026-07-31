-- AlterTable
ALTER TABLE "MonitoredNetworkDevice" ADD COLUMN     "loggedInUser" TEXT;

-- AlterTable
ALTER TABLE "NetworkScanResult" ADD COLUMN     "loggedInUser" TEXT;
