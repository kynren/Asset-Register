-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "batteryCharging" BOOLEAN,
ADD COLUMN     "batteryPercent" INTEGER,
ADD COLUMN     "batteryPresent" BOOLEAN;
