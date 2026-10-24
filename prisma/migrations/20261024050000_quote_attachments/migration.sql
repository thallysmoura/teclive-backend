-- CreateTable
CREATE TABLE "quote_attachments" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "caption" VARCHAR(200),
    "mimeType" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "quote_attachments" ADD CONSTRAINT "quote_attachments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
