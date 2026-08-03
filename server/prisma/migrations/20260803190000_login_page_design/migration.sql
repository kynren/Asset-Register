-- CreateTable
CREATE TABLE "LoginPageDesign" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginPageDesign_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoginPageDesign" ADD CONSTRAINT "LoginPageDesign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
