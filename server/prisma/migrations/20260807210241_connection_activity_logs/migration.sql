-- AlterTable
ALTER TABLE "McpApiKey" ADD COLUMN     "lastUsedIp" TEXT;

-- CreateTable
CREATE TABLE "McpAccessLog" (
    "id" SERIAL NOT NULL,
    "keyId" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiConnectionLog" (
    "id" SERIAL NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiConnectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpAccessLog_keyId_occurredAt_idx" ON "McpAccessLog"("keyId", "occurredAt");

-- CreateIndex
CREATE INDEX "ApiConnectionLog_connectionId_occurredAt_idx" ON "ApiConnectionLog"("connectionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "McpAccessLog" ADD CONSTRAINT "McpAccessLog_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "McpApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiConnectionLog" ADD CONSTRAINT "ApiConnectionLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ApiConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
