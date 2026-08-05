-- CreateEnum
CREATE TYPE "AssetIntakeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN "publicIntakeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicIntakeToken" TEXT;

-- CreateTable
CREATE TABLE "AssetIntakeSubmission" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "fieldValues" JSONB NOT NULL,
    "status" "AssetIntakeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewNotes" TEXT,
    "resultingAssetId" INTEGER,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AssetIntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_publicIntakeToken_key" ON "AssetCategory"("publicIntakeToken");

-- CreateIndex
CREATE UNIQUE INDEX "AssetIntakeSubmission_resultingAssetId_key" ON "AssetIntakeSubmission"("resultingAssetId");

-- AddForeignKey
ALTER TABLE "AssetIntakeSubmission" ADD CONSTRAINT "AssetIntakeSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIntakeSubmission" ADD CONSTRAINT "AssetIntakeSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetIntakeSubmission" ADD CONSTRAINT "AssetIntakeSubmission_resultingAssetId_fkey" FOREIGN KEY ("resultingAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
