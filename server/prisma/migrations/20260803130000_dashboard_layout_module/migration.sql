-- DropIndex
DROP INDEX "DashboardLayout_userId_key";

-- AlterTable
ALTER TABLE "DashboardLayout" ADD COLUMN     "module" TEXT NOT NULL DEFAULT 'home';

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_module_key" ON "DashboardLayout"("userId", "module");
