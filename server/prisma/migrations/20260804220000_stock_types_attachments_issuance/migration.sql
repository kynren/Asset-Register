-- CreateTable
CREATE TABLE "StockItemType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItemType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItemType_code_key" ON "StockItemType"("code");

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "stockItemTypeId" INTEGER;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_stockItemTypeId_fkey" FOREIGN KEY ("stockItemTypeId") REFERENCES "StockItemType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "StockItemAttachment" (
    "id" SERIAL NOT NULL,
    "stockItemId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "originalName" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockItemAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockItemAttachment" ADD CONSTRAINT "StockItemAttachment_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItemAttachment" ADD CONSTRAINT "StockItemAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "StockIssuance" (
    "id" SERIAL NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "receivedById" INTEGER NOT NULL,
    "signatureImageUrl" TEXT NOT NULL,
    "scannedSku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockIssuance_transactionId_key" ON "StockIssuance"("transactionId");

-- AddForeignKey
ALTER TABLE "StockIssuance" ADD CONSTRAINT "StockIssuance_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "StockTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssuance" ADD CONSTRAINT "StockIssuance_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
