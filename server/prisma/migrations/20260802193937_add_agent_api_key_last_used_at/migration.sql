-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables (and their FKs) here — those are the multi-tenant control plane's raw-SQL
-- tables (see config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in
-- schema.prisma since they're shared across every tenant schema and managed outside Prisma. Those
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.

-- AlterTable
ALTER TABLE "AgentApiKey" ADD COLUMN     "lastUsedAt" TIMESTAMP(3);

