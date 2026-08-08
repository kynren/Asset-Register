-- CreateEnum
CREATE TYPE "ExternalConnectorDirection" AS ENUM ('PUSH', 'PULL', 'BOTH');

-- CreateTable
CREATE TABLE "ExternalConnector" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authHeaderName" TEXT NOT NULL DEFAULT 'Authorization',
    "authHeaderValueEncrypted" TEXT NOT NULL,
    "direction" "ExternalConnectorDirection" NOT NULL DEFAULT 'PULL',
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastPulledAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalConnectorLog" (
    "id" SERIAL NOT NULL,
    "connectorId" INTEGER NOT NULL,
    "direction" "ExternalConnectorDirection" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "recordCounts" JSONB,
    "error" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalConnectorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalConnectorRecord" (
    "id" SERIAL NOT NULL,
    "connectorId" INTEGER NOT NULL,
    "store" TEXT NOT NULL,
    "externalId" TEXT,
    "data" JSONB NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalConnectorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalConnectorLog_connectorId_occurredAt_idx" ON "ExternalConnectorLog"("connectorId", "occurredAt");

-- CreateIndex
CREATE INDEX "ExternalConnectorRecord_connectorId_store_idx" ON "ExternalConnectorRecord"("connectorId", "store");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalConnectorRecord_connectorId_store_externalId_key" ON "ExternalConnectorRecord"("connectorId", "store", "externalId");

-- AddForeignKey
ALTER TABLE "ExternalConnector" ADD CONSTRAINT "ExternalConnector_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalConnectorLog" ADD CONSTRAINT "ExternalConnectorLog_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ExternalConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalConnectorRecord" ADD CONSTRAINT "ExternalConnectorRecord_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ExternalConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
