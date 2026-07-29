-- CreateEnum
CREATE TYPE "AssetFormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX');

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "formTemplateId" INTEGER;

-- CreateTable
CREATE TABLE "AssetFormTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetFormField" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldType" "AssetFormFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCustomFieldValue" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "value" TEXT,

    CONSTRAINT "AssetCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetFormTemplate_name_key" ON "AssetFormTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFormField_templateId_fieldKey_key" ON "AssetFormField"("templateId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCustomFieldValue_assetId_fieldId_key" ON "AssetCustomFieldValue"("assetId", "fieldId");

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES "AssetFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFormField" ADD CONSTRAINT "AssetFormField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssetFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCustomFieldValue" ADD CONSTRAINT "AssetCustomFieldValue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCustomFieldValue" ADD CONSTRAINT "AssetCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "AssetFormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
