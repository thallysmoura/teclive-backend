-- CreateTable
CREATE TABLE "os_folders" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdBy" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "os_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "os_folder_items" (
    "orderId" TEXT NOT NULL,
    "attachmentId" VARCHAR(40) NOT NULL,
    "folderId" TEXT NOT NULL,

    CONSTRAINT "os_folder_items_pkey" PRIMARY KEY ("orderId","attachmentId")
);

-- CreateIndex
CREATE INDEX "os_folders_orderId_idx" ON "os_folders"("orderId");

-- CreateIndex
CREATE INDEX "os_folder_items_folderId_idx" ON "os_folder_items"("folderId");

-- AddForeignKey
ALTER TABLE "os_folder_items" ADD CONSTRAINT "os_folder_items_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "os_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
