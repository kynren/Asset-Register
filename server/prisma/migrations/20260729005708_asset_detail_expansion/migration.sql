-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "antivirusLastScanAt" TIMESTAMP(3),
ADD COLUMN     "antivirusProduct" TEXT,
ADD COLUMN     "antivirusStatus" TEXT,
ADD COLUMN     "featuredImageUrl" TEXT,
ADD COLUMN     "gridPowered" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hypervisor" TEXT,
ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteManagementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteManagementProtocol" TEXT,
ADD COLUMN     "remoteManagementUrl" TEXT,
ADD COLUMN     "vmHost" TEXT;

-- CreateTable
CREATE TABLE "AssetPhoto" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetComponent" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVolume" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "totalGb" DOUBLE PRECISION,
    "freeGb" DOUBLE PRECISION,
    "fileSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetConnection" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT,
    "target" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetNetworkPort" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "portNumber" INTEGER NOT NULL,
    "protocol" TEXT,
    "serviceName" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetNetworkPort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetSocket" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetSocket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetContract" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "contractNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDocument" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetComponent" ADD CONSTRAINT "AssetComponent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVolume" ADD CONSTRAINT "AssetVolume_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetConnection" ADD CONSTRAINT "AssetConnection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetNetworkPort" ADD CONSTRAINT "AssetNetworkPort_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSocket" ADD CONSTRAINT "AssetSocket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetContract" ADD CONSTRAINT "AssetContract_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
