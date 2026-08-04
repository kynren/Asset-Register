-- Generic app-wide creator/editor/delete-access grant system, replacing the IT-Projects-only
-- ProjectCardEditor table.
CREATE TYPE "RecordAccessLevel" AS ENUM ('EDIT', 'DELETE');

CREATE TABLE "RecordAccessGrant" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "level" "RecordAccessLevel" NOT NULL,
    "grantedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordAccessGrant_entityType_entityId_userId_level_key" ON "RecordAccessGrant"("entityType", "entityId", "userId", "level");
CREATE INDEX "RecordAccessGrant_entityType_entityId_idx" ON "RecordAccessGrant"("entityType", "entityId");

ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry over existing IT Project edit grants as EDIT-level rows before dropping the old table.
-- grantedById wasn't tracked before, so the project's own creator is used as the best-known
-- attribution for who effectively authorized the access.
INSERT INTO "RecordAccessGrant" ("entityType", "entityId", "userId", "level", "grantedById", "createdAt")
SELECT 'ProjectCard', pce."projectCardId", pce."userId", 'EDIT', pc."createdById", pce."createdAt"
FROM "ProjectCardEditor" pce
JOIN "ProjectCard" pc ON pc."id" = pce."projectCardId";

ALTER TABLE "ProjectCardEditor" DROP CONSTRAINT IF EXISTS "ProjectCardEditor_projectCardId_fkey";
ALTER TABLE "ProjectCardEditor" DROP CONSTRAINT IF EXISTS "ProjectCardEditor_userId_fkey";
DROP TABLE "ProjectCardEditor";

-- Gates: Paxton Net2 access-control server registry (connection details + reachability only).
CREATE TABLE "Net2Server" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8443,
    "clientId" TEXT,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "notes" TEXT,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Net2Server_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Net2Server" ADD CONSTRAINT "Net2Server_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
