-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "orgSwitchConfirmedOrgId" INTEGER,
ADD COLUMN     "orgSwitchConfirmedUntil" TIMESTAMP(3);
