-- CreateEnum
CREATE TYPE "GateState" AS ENUM ('OPEN', 'CLOSED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Gate" (
    "id" SERIAL NOT NULL,
    "net2ServerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "relayNumber" INTEGER NOT NULL,
    "state" "GateState" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gate_net2ServerId_relayNumber_key" ON "Gate"("net2ServerId", "relayNumber");

-- AddForeignKey
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_net2ServerId_fkey" FOREIGN KEY ("net2ServerId") REFERENCES "Net2Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

