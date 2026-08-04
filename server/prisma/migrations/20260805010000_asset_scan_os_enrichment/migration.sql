ALTER TABLE "Asset" ADD COLUMN "os" TEXT;
ALTER TABLE "Asset" ADD COLUMN "loggedInUser" TEXT;

ALTER TABLE "NetworkScanResult" ADD COLUMN "os" TEXT;

ALTER TABLE "MonitoredNetworkDevice" ADD COLUMN "os" TEXT;
