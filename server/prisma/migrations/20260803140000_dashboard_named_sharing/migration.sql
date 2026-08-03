-- CreateTable
CREATE TABLE "Dashboard" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'home',
    "ownerId" INTEGER NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardShare" (
    "id" SERIAL NOT NULL,
    "dashboardId" INTEGER NOT NULL,
    "sharedWithUserId" INTEGER,
    "sharedWithTeamId" INTEGER,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dashboard_ownerId_module_idx" ON "Dashboard"("ownerId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_sharedWithUserId_key" ON "DashboardShare"("dashboardId", "sharedWithUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_sharedWithTeamId_key" ON "DashboardShare"("dashboardId", "sharedWithTeamId");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_sharedWithTeamId_fkey" FOREIGN KEY ("sharedWithTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: carry every existing single-per-(user,module) layout forward as that user's
-- default named dashboard for that module, so nobody's saved widget arrangement is lost when
-- DashboardLayout is replaced by the new named/shareable Dashboard model.
INSERT INTO "Dashboard" ("name", "module", "ownerId", "layoutJson", "isDefault", "createdAt", "updatedAt")
SELECT 'Default', "module", "userId", "layoutJson", true, "updatedAt", "updatedAt"
FROM "DashboardLayout";

-- DropForeignKey
ALTER TABLE "DashboardLayout" DROP CONSTRAINT "DashboardLayout_userId_fkey";

-- DropTable
DROP TABLE "DashboardLayout";
