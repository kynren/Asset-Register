-- AlterTable
ALTER TABLE "ResourceSchedule"
  ADD COLUMN "role" TEXT,
  ADD COLUMN "groupLabel" TEXT NOT NULL DEFAULT 'Technicians & Crews',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "color" TEXT;
