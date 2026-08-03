-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables (and their FKs) here — those are the multi-tenant control plane's raw-SQL
-- tables (see config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in
-- schema.prisma since they're shared across every tenant schema and managed outside Prisma. Those
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.
--
-- NOTE: this migration adds AssetCollection (a new organizational layer above AssetCategory) and
-- AgentLogEntry (relay agent log shipping). The INSERT/UPDATE statements after AssetCollection's
-- CreateTable seed "IT Assets" and "Harness" collections and backfill every existing
-- AssetCategory's collectionId so nothing is left uncategorized — a bare `migrate diff` only adds
-- the nullable column, it doesn't know how to seed/backfill it.

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "collectionId" INTEGER;

-- CreateTable
CREATE TABLE "AssetCollection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLogEntry" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'network_relay',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCollection_name_key" ON "AssetCollection"("name");

-- CreateIndex
CREATE INDEX "AgentLogEntry_createdAt_idx" ON "AgentLogEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "AssetCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default collections + backfill every existing category into one of them
INSERT INTO "AssetCollection" ("name") VALUES ('IT Assets'), ('Harness');

UPDATE "AssetCategory" SET "collectionId" = (SELECT "id" FROM "AssetCollection" WHERE "name" = 'Harness') WHERE "name" = 'Harness';

UPDATE "AssetCategory" SET "collectionId" = (SELECT "id" FROM "AssetCollection" WHERE "name" = 'IT Assets') WHERE "collectionId" IS NULL;
