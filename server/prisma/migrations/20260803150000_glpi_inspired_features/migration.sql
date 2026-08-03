-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "supplier" TEXT;

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "capacities" JSONB;

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "scopeAssignedOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SavedView" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "filters" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedViewShare" (
    "id" SERIAL NOT NULL,
    "savedViewId" INTEGER NOT NULL,
    "sharedWithUserId" INTEGER,
    "sharedWithTeamId" INTEGER,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedViewShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContactEmail" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserContactEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketApprovalSubstitute" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "substituteId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketApprovalSubstitute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_ownerId_tableId_idx" ON "SavedView"("ownerId", "tableId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedViewShare_savedViewId_sharedWithUserId_key" ON "SavedViewShare"("savedViewId", "sharedWithUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedViewShare_savedViewId_sharedWithTeamId_key" ON "SavedViewShare"("savedViewId", "sharedWithTeamId");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedViewShare" ADD CONSTRAINT "SavedViewShare_savedViewId_fkey" FOREIGN KEY ("savedViewId") REFERENCES "SavedView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedViewShare" ADD CONSTRAINT "SavedViewShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedViewShare" ADD CONSTRAINT "SavedViewShare_sharedWithTeamId_fkey" FOREIGN KEY ("sharedWithTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContactEmail" ADD CONSTRAINT "UserContactEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApprovalSubstitute" ADD CONSTRAINT "TicketApprovalSubstitute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApprovalSubstitute" ADD CONSTRAINT "TicketApprovalSubstitute_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
