-- AlterTable
ALTER TABLE "service_order_files" ADD COLUMN     "fileUrl" VARCHAR(500),
ALTER COLUMN "fileData" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_orders" ALTER COLUMN "openedBy" SET DEFAULT 'â€”';
