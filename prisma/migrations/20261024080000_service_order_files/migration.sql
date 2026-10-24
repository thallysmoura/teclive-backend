-- CreateTable
CREATE TABLE "service_order_files" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_order_files_orderId_idx" ON "service_order_files"("orderId");
