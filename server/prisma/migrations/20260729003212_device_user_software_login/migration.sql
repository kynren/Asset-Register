-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "installedSoftware" JSONB,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "loggedInUser" TEXT;
