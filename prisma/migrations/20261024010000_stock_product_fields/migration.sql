-- AlterTable
ALTER TABLE "stock_products" ADD COLUMN     "costPrice" DECIMAL(14,2),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "legacyId" INTEGER,
ADD COLUMN     "model" VARCHAR(200),
ADD COLUMN     "salePrice" DECIMAL(14,2);

-- CreateIndex
CREATE UNIQUE INDEX "stock_products_legacyId_key" ON "stock_products"("legacyId");
