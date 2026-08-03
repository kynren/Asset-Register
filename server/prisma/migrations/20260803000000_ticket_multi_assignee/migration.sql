-- NOTE: `prisma migrate diff` also wanted to DROP the "account_index", "organizations", and
-- "token_index" tables (and their FKs) here — those are the multi-tenant control plane's raw-SQL
-- tables (see config/controlPlane.ts's bootstrapControlPlane()), deliberately NOT modeled in
-- schema.prisma since they're shared across every tenant schema and managed outside Prisma. Those
-- statements were removed by hand; never let a future `migrate diff` regenerate and apply them.
--
-- NOTE: this migration also replaces Ticket.assigneeId/assignedTeamId (singular scalar FKs) with
-- the new TicketAssignee/TicketAssignedTeam join tables (multi-assignee support). Unlike a plain
-- `migrate diff` output, the DROP COLUMN statements below are preceded by hand-written INSERT
-- statements that copy every existing assignment into the new join tables first — a bare
-- `migrate diff` would have silently discarded all existing ticket assignments.

-- AlterEnum
ALTER TYPE "EmailEventType" ADD VALUE 'TICKET_ASSIGNED';

-- CreateTable
CREATE TABLE "TicketAssignee" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TicketAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAssignedTeam" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "TicketAssignedTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketAssignee_ticketId_userId_key" ON "TicketAssignee"("ticketId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAssignedTeam_ticketId_teamId_key" ON "TicketAssignedTeam"("ticketId", "teamId");

-- AddForeignKey
ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignee" ADD CONSTRAINT "TicketAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignedTeam" ADD CONSTRAINT "TicketAssignedTeam_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignedTeam" ADD CONSTRAINT "TicketAssignedTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DataMigration: copy existing single assignments into the new join tables before the old
-- columns are dropped below.
INSERT INTO "TicketAssignee" ("ticketId", "userId")
  SELECT "id", "assigneeId" FROM "Ticket" WHERE "assigneeId" IS NOT NULL;

INSERT INTO "TicketAssignedTeam" ("ticketId", "teamId")
  SELECT "id", "assignedTeamId" FROM "Ticket" WHERE "assignedTeamId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_assignedTeamId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_assigneeId_fkey";

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "assignedTeamId",
DROP COLUMN "assigneeId";
