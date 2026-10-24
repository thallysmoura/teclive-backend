-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "cancellationDate" TIMESTAMP(3),
    "userName" VARCHAR(160) NOT NULL,
    "operation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_legacyId_key" ON "stock_movements"("legacyId");
