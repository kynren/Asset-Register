-- CreateTable
CREATE TABLE "ToastSetting" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "variant" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToastSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToastSetting_type_key" ON "ToastSetting"("type");

-- AddForeignKey
ALTER TABLE "ToastSetting" ADD CONSTRAINT "ToastSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
