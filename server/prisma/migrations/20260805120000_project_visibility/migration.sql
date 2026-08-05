-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'RESTRICTED');

-- AlterEnum
ALTER TYPE "RecordAccessLevel" ADD VALUE 'VIEW';

-- AlterTable
ALTER TABLE "ProjectCard" ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'PUBLIC';
