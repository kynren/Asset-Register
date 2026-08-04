-- RecordAccessGrant: allow granting access to a Team, not just an individual user.
-- userId becomes optional (drop existing unique index + NOT NULL, add teamId + its own unique
-- index) — the original unique constraint was created as a plain CREATE UNIQUE INDEX, not a table
-- CONSTRAINT, so it must be dropped with DROP INDEX, not DROP CONSTRAINT.
DROP INDEX IF EXISTS "RecordAccessGrant_entityType_entityId_userId_level_key";
ALTER TABLE "RecordAccessGrant" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "RecordAccessGrant" ADD COLUMN "teamId" INTEGER;

ALTER TABLE "RecordAccessGrant" DROP CONSTRAINT IF EXISTS "RecordAccessGrant_userId_fkey";
ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RecordAccessGrant_entityType_entityId_userId_level_key" ON "RecordAccessGrant"("entityType", "entityId", "userId", "level");
CREATE UNIQUE INDEX "RecordAccessGrant_entityType_entityId_teamId_level_key" ON "RecordAccessGrant"("entityType", "entityId", "teamId", "level");
