-- CreateEnum
CREATE TYPE "DoorState" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Door" ADD COLUMN     "doorState" "DoorState" NOT NULL DEFAULT 'UNKNOWN';

