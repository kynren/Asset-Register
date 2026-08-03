-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinHash" TEXT;
