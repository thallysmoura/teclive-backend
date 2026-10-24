-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "legacyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "stock_movement_items" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "productId" TEXT,
    "description" VARCHAR(300) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "locationName" VARCHAR(200) NOT NULL,

    CONSTRAINT "stock_movement_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
