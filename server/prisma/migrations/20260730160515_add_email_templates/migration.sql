-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('ACCOUNT_CREATED', 'ASSET_ASSIGNED', 'PASSWORD_RESET', 'TASK_OVERDUE', 'LOW_STOCK');

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "subject" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailTemplate_eventType_idx" ON "EmailTemplate"("eventType");

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
