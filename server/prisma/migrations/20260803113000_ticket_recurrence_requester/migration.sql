-- AlterTable
ALTER TABLE "TicketRecurrence" ADD COLUMN     "requesterId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "TicketRecurrence" ADD CONSTRAINT "TicketRecurrence_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
