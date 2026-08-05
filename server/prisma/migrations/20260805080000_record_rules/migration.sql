-- CreateEnum
CREATE TYPE "RecordRuleTrigger" AS ENUM ('ON_CREATE', 'ON_UPDATE', 'ON_CREATE_OR_UPDATE');

-- CreateTable
CREATE TABLE "RecordRule" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "trigger" "RecordRuleTrigger" NOT NULL DEFAULT 'ON_CREATE_OR_UPDATE',
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordRule_entityType_idx" ON "RecordRule"("entityType");
