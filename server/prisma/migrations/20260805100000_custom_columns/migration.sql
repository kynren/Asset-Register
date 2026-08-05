-- CreateEnum
CREATE TYPE "CustomColumnFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN');

-- CreateTable
CREATE TABLE "CustomColumn" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" "CustomColumnFieldType" NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomColumnValue" (
    "id" SERIAL NOT NULL,
    "customColumnId" INTEGER NOT NULL,
    "entityId" INTEGER NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomColumnValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomColumn_entityType_idx" ON "CustomColumn"("entityType");

-- CreateIndex
CREATE INDEX "CustomColumnValue_entityId_idx" ON "CustomColumnValue"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomColumnValue_customColumnId_entityId_key" ON "CustomColumnValue"("customColumnId", "entityId");

-- AddForeignKey
ALTER TABLE "CustomColumn" ADD CONSTRAINT "CustomColumn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomColumnValue" ADD CONSTRAINT "CustomColumnValue_customColumnId_fkey" FOREIGN KEY ("customColumnId") REFERENCES "CustomColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
