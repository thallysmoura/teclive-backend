-- AlterTable
ALTER TABLE "stock_products" ADD COLUMN     "alternativeDescription" VARCHAR(300),
ADD COLUMN     "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowRental" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "barcode" VARCHAR(60),
ADD COLUMN     "identifier" VARCHAR(60),
ADD COLUMN     "margin" DECIMAL(8,2),
ADD COLUMN     "supplierCode" VARCHAR(60);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_items" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "category" VARCHAR(200),
    "modality" INTEGER NOT NULL DEFAULT 1,
    "serviceType" INTEGER NOT NULL DEFAULT 3,
    "allowsRental" BOOLEAN NOT NULL DEFAULT false,
    "blocksOnDelinquency" BOOLEAN NOT NULL DEFAULT false,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "margin" DECIMAL(8,2) NOT NULL DEFAULT 50,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "type" VARCHAR(1) NOT NULL DEFAULT 'F',
    "document" VARCHAR(20),
    "name" VARCHAR(200) NOT NULL,
    "nickname" VARCHAR(200),
    "rg" VARCHAR(30),
    "identifier" VARCHAR(60),
    "isClient" BOOLEAN NOT NULL DEFAULT true,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "isEmployee" BOOLEAN NOT NULL DEFAULT false,
    "isTechnician" BOOLEAN NOT NULL DEFAULT false,
    "isCarrier" BOOLEAN NOT NULL DEFAULT false,
    "isSeller" BOOLEAN NOT NULL DEFAULT false,
    "taxpayerType" INTEGER,
    "isFinalConsumer" BOOLEAN NOT NULL DEFAULT false,
    "municipalRegistration" VARCHAR(40),
    "stateRegistration" VARCHAR(40),
    "email" VARCHAR(200),
    "phone" VARCHAR(40),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_kind_description_key" ON "catalog_items"("kind", "description");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_kind_legacyId_key" ON "catalog_items"("kind", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "service_items_legacyId_key" ON "service_items"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "people_legacyId_key" ON "people"("legacyId");
