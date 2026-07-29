-- CreateEnum
CREATE TYPE "NodeRole" AS ENUM ('CORE_SWITCH', 'DISTRIBUTION_SWITCH', 'EDGE_SWITCH', 'GATEWAY_ROUTER', 'HARDWARE_HOST');

-- AlterTable
ALTER TABLE "NetworkEdge" ADD COLUMN     "bandwidthMbps" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "NetworkNode" ADD COLUMN     "role" "NodeRole";
