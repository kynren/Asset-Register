-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "externalKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_externalKey_key" ON "Document"("externalKey");
