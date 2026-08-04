CREATE TABLE "ChangelogEntry" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangelogEntry_publishedAt_idx" ON "ChangelogEntry"("publishedAt");

ALTER TABLE "ChangelogEntry" ADD CONSTRAINT "ChangelogEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
