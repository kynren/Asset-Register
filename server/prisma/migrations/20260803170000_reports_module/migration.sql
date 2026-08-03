-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "filters" JSONB,
    "columns" JSONB,
    "groupBy" TEXT,
    "visualization" TEXT NOT NULL DEFAULT 'table',
    "sortBy" TEXT,
    "sortDir" TEXT NOT NULL DEFAULT 'asc',
    "ownerId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShare" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sharedWithUserId" INTEGER,
    "sharedWithTeamId" INTEGER,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_ownerId_idx" ON "Report"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_reportId_sharedWithUserId_key" ON "ReportShare"("reportId", "sharedWithUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_reportId_sharedWithTeamId_key" ON "ReportShare"("reportId", "sharedWithTeamId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_sharedWithTeamId_fkey" FOREIGN KEY ("sharedWithTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
