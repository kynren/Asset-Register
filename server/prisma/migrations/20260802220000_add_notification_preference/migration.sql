-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables (and their FKs) here — those are the multi-tenant control plane's raw-SQL
-- tables (see config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in
-- schema.prisma since they're shared across every tenant schema and managed outside Prisma. Those
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.

-- CreateEnum
CREATE TYPE "NotificationEventKind" AS ENUM ('TICKET_ASSIGNED', 'TICKET_WATCHING', 'ASSET_ASSIGNED', 'LOW_STOCK', 'MAINTENANCE_DUE', 'DEVICE_OFFLINE');

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" "NotificationEventKind" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_kind_key" ON "NotificationPreference"("userId", "kind");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
