-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SOP', 'WORK_INSTRUCTION', 'TECHNICAL_RUNBOOK', 'MAINTENANCE_CHECKLIST', 'POLICY', 'SHOW_PRODUCTION', 'TRAINING', 'GENERAL');

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "sections" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchText" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "reviewDueDate" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_docType_idx" ON "Document"("docType");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search index: searchText is a flattened plain-text copy of title + summary + every
-- section + tags (regenerated on every write), so search queries stay simple regardless of how
-- deeply nested a given docType's sections JSON is.
CREATE INDEX "Document_searchText_fts_idx" ON "Document" USING GIN (to_tsvector('english', "searchText"));
