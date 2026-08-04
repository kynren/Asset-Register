-- AlterEnum
ALTER TYPE "NotificationEventKind" ADD VALUE 'PROJECT_UPDATED';

-- AlterEnum
ALTER TYPE "EmailEventType" ADD VALUE 'PROJECT_UPDATED';

-- CreateEnum
CREATE TYPE "ProjectAttachmentKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'FILE');

-- CreateTable
CREATE TABLE "ProjectCardEditor" (
    "id" SERIAL NOT NULL,
    "projectCardId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCardEditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCardAttachment" (
    "id" SERIAL NOT NULL,
    "projectCardId" INTEGER NOT NULL,
    "kind" "ProjectAttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCardAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCardEditor_projectCardId_userId_key" ON "ProjectCardEditor"("projectCardId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectCardEditor" ADD CONSTRAINT "ProjectCardEditor_projectCardId_fkey" FOREIGN KEY ("projectCardId") REFERENCES "ProjectCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCardEditor" ADD CONSTRAINT "ProjectCardEditor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCardAttachment" ADD CONSTRAINT "ProjectCardAttachment_projectCardId_fkey" FOREIGN KEY ("projectCardId") REFERENCES "ProjectCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCardAttachment" ADD CONSTRAINT "ProjectCardAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
