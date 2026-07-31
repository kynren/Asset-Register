-- CreateTable
CREATE TABLE "AccessCredentialDoorRight" (
    "id" SERIAL NOT NULL,
    "credentialId" INTEGER NOT NULL,
    "doorId" INTEGER NOT NULL,
    "planTemplateNo" TEXT NOT NULL DEFAULT '1',

    CONSTRAINT "AccessCredentialDoorRight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessCredentialDoorRight_credentialId_doorId_key" ON "AccessCredentialDoorRight"("credentialId", "doorId");

-- AddForeignKey
ALTER TABLE "AccessCredentialDoorRight" ADD CONSTRAINT "AccessCredentialDoorRight_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AccessCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredentialDoorRight" ADD CONSTRAINT "AccessCredentialDoorRight_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "Door"("id") ON DELETE CASCADE ON UPDATE CASCADE;

