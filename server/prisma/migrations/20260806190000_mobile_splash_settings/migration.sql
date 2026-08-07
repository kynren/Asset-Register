-- CreateEnum
CREATE TYPE "MobileSplashMediaType" AS ENUM ('PHOTO', 'GIF', 'VIDEO');

-- CreateTable
CREATE TABLE "MobileSplashSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mediaType" "MobileSplashMediaType" NOT NULL DEFAULT 'PHOTO',
    "mediaUrl" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#0d1117',
    "minDisplayMs" INTEGER NOT NULL DEFAULT 1500,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileSplashSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MobileSplashSettings" ADD CONSTRAINT "MobileSplashSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
