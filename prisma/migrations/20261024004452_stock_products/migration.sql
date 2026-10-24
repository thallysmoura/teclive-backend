-- CreateTable
CREATE TABLE "stock_products" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "brand" VARCHAR(120) NOT NULL DEFAULT 'Geral',
    "productGroup" VARCHAR(120) NOT NULL DEFAULT 'Geral',
    "unit" VARCHAR(20) NOT NULL,
    "unitName" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_product_balances" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "stock_product_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_product_balances_productId_locationId_key" ON "stock_product_balances"("productId", "locationId");

-- AddForeignKey
ALTER TABLE "stock_product_balances" ADD CONSTRAINT "stock_product_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "stock_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_product_balances" ADD CONSTRAINT "stock_product_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
