/*
  Warnings:

  - Added the required column `collectionId` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "collectionId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "DocCollection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocCollection_name_key" ON "DocCollection"("name");

-- CreateIndex
CREATE INDEX "Document_collectionId_idx" ON "Document"("collectionId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DocCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
