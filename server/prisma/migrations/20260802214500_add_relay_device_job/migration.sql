-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables (and their FKs) here — those are the multi-tenant control plane's raw-SQL
-- tables (see config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in
-- schema.prisma since they're shared across every tenant schema and managed outside Prisma. Those
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.

-- CreateEnum
CREATE TYPE "RelayDeviceJobKind" AS ENUM ('PING', 'HTTP');

-- CreateEnum
CREATE TYPE "RelayDeviceJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "RelayDeviceJob" (
    "id" SERIAL NOT NULL,
    "kind" "RelayDeviceJobKind" NOT NULL,
    "status" "RelayDeviceJobStatus" NOT NULL DEFAULT 'PENDING',
    "target" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "protocolScheme" TEXT DEFAULT 'http',
    "requestHeaders" JSONB,
    "requestBody" TEXT,
    "digestUsername" TEXT,
    "digestPasswordEncrypted" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBodyBase64" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RelayDeviceJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelayDeviceJob_status_createdAt_idx" ON "RelayDeviceJob"("status", "createdAt");
