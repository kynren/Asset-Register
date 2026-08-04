-- Device: subnet mask / default gateway / DNS servers, reported by the desktop agent alongside
-- the IP addresses it already collects (see agent/kynren_agent.py's get_network_settings()).
ALTER TABLE "Device" ADD COLUMN "subnetMask" TEXT;
ALTER TABLE "Device" ADD COLUMN "defaultGateway" TEXT;
ALTER TABLE "Device" ADD COLUMN "dnsServers" TEXT;
