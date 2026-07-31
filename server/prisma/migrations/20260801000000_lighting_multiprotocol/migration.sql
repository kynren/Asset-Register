-- CreateEnum
CREATE TYPE "LightingProtocol" AS ENUM ('SHELLY', 'TASMOTA', 'GENERIC_HTTP');

-- AlterTable
ALTER TABLE "LightingDevice" ADD COLUMN     "offUrl" TEXT,
ADD COLUMN     "onUrl" TEXT,
ADD COLUMN     "protocol" "LightingProtocol" NOT NULL DEFAULT 'SHELLY',
ADD COLUMN     "statusOnPath" TEXT,
ADD COLUMN     "statusUrl" TEXT,
ALTER COLUMN "ipAddress" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LightingScanResult" ADD COLUMN     "protocol" "LightingProtocol" NOT NULL DEFAULT 'SHELLY';

