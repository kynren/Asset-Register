-- CreateEnum
CREATE TYPE "TicketItilType" AS ENUM ('INCIDENT', 'REQUEST', 'PROBLEM', 'CHANGE');

-- CreateEnum
CREATE TYPE "PlanningState" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "SolutionStatus" AS ENUM ('WAITING', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('WAITING', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "TicketLinkType" AS ENUM ('RELATES_TO', 'CAUSES', 'CAUSED_BY', 'DUPLICATES');

-- CreateEnum
CREATE TYPE "TemplateFieldMode" AS ENUM ('HIDDEN', 'MANDATORY', 'READONLY', 'PREDEFINED');

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "itilType" "TicketItilType" NOT NULL DEFAULT 'INCIDENT',
ADD COLUMN     "satisfactionAskedAt" TIMESTAMP(3),
ADD COLUMN     "slaId" INTEGER,
ADD COLUMN     "templateId" INTEGER,
ADD COLUMN     "ttoDueAt" TIMESTAMP(3),
ADD COLUMN     "ttoMetAt" TIMESTAMP(3),
ADD COLUMN     "ttrDueAt" TIMESTAMP(3),
ADD COLUMN     "ttrMetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketCategory" ADD COLUMN     "defaultSlaId" INTEGER,
ADD COLUMN     "defaultTemplateId" INTEGER,
ADD COLUMN     "parentId" INTEGER;

-- CreateTable
CREATE TABLE "HelpdeskSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "surveySampleRatePercent" INTEGER NOT NULL DEFAULT 100,
    "surveyDelayDays" INTEGER NOT NULL DEFAULT 1,
    "surveyExpireDays" INTEGER NOT NULL DEFAULT 30,
    "autoCloseDelayDays" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpdeskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTask" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "actionTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "begin" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "state" "PlanningState" NOT NULL DEFAULT 'TODO',
    "assignedToId" INTEGER,
    "authorId" INTEGER NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSolution" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "status" "SolutionStatus" NOT NULL DEFAULT 'WAITING',
    "answeredById" INTEGER,
    "answerComment" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "itilType" "TicketItilType" NOT NULL DEFAULT 'INCIDENT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTemplateField" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "mode" "TemplateFieldMode" NOT NULL,
    "predefinedValue" TEXT,

    CONSTRAINT "TicketTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSla" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ttoMinutes" INTEGER,
    "ttrMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRecurrence" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "periodicityDays" INTEGER NOT NULL,
    "createBeforeDays" INTEGER NOT NULL DEFAULT 0,
    "nextCreationAt" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCreatedTicketId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketLink" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "linkedTicketId" INTEGER NOT NULL,
    "linkType" "TicketLinkType" NOT NULL DEFAULT 'RELATES_TO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketApproval" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "targetUserId" INTEGER,
    "targetTeamId" INTEGER,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'WAITING',
    "comment" TEXT,
    "answeredById" INTEGER,
    "answerComment" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketKnowledgeArticle" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTemplate_name_key" ON "TicketTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTemplateField_templateId_fieldKey_mode_key" ON "TicketTemplateField"("templateId", "fieldKey", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSla_name_key" ON "TicketSla"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TicketLink_ticketId_linkedTicketId_key" ON "TicketLink"("ticketId", "linkedTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketKnowledgeArticle_ticketId_articleId_key" ON "TicketKnowledgeArticle"("ticketId", "articleId");

-- AddForeignKey
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TicketCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_defaultTemplateId_fkey" FOREIGN KEY ("defaultTemplateId") REFERENCES "TicketTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_defaultSlaId_fkey" FOREIGN KEY ("defaultSlaId") REFERENCES "TicketSla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "TicketSla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSolution" ADD CONSTRAINT "TicketSolution_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSolution" ADD CONSTRAINT "TicketSolution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSolution" ADD CONSTRAINT "TicketSolution_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTemplateField" ADD CONSTRAINT "TicketTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRecurrence" ADD CONSTRAINT "TicketRecurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRecurrence" ADD CONSTRAINT "TicketRecurrence_lastCreatedTicketId_fkey" FOREIGN KEY ("lastCreatedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLink" ADD CONSTRAINT "TicketLink_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApproval" ADD CONSTRAINT "TicketApproval_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApproval" ADD CONSTRAINT "TicketApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApproval" ADD CONSTRAINT "TicketApproval_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApproval" ADD CONSTRAINT "TicketApproval_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketApproval" ADD CONSTRAINT "TicketApproval_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketKnowledgeArticle" ADD CONSTRAINT "TicketKnowledgeArticle_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketKnowledgeArticle" ADD CONSTRAINT "TicketKnowledgeArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
