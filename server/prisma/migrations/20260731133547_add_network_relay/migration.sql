-- AlterEnum
ALTER TYPE "ScanStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "NetworkScan" ADD COLUMN     "viaRelay" BOOLEAN NOT NULL DEFAULT false;
