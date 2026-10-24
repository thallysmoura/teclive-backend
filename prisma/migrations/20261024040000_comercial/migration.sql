-- AlterTable
ALTER TABLE "people" ADD COLUMN     "becameClientAt" TIMESTAMP(3),
ADD COLUMN     "isLead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sellerName" VARCHAR(200);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(200),
    "personId" TEXT,
    "personName" VARCHAR(200) NOT NULL,
    "personNickname" VARCHAR(200),
    "personDocument" VARCHAR(20),
    "personType" VARCHAR(1) NOT NULL DEFAULT 'F',
    "personIsLead" BOOLEAN NOT NULL DEFAULT false,
    "sellerName" VARCHAR(200),
    "status" INTEGER NOT NULL DEFAULT 3,
    "purpose" INTEGER NOT NULL DEFAULT 1,
    "modality" INTEGER NOT NULL DEFAULT 2,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "wonAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refusalReason" VARCHAR(200),
    "technicalSheet" TEXT,
    "notes" TEXT,
    "showNotes" BOOLEAN NOT NULL DEFAULT false,
    "contactName" VARCHAR(200),
    "contactEmail" VARCHAR(200),
    "contactPhone" VARCHAR(40),
    "address" JSONB,
    "openedBy" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "identifier" VARCHAR(60),
    "unit" VARCHAR(20),
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitValue" DECIMAL(14,2) NOT NULL,
    "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rental" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_payments" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "method" VARCHAR(120) NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "total" DECIMAL(14,2) NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quote_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_history" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refusal_reasons" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "usedWhen" VARCHAR(12) NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refusal_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_actions" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "personName" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "durationHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "channel" VARCHAR(60) NOT NULL,
    "supportTeam" VARCHAR(120),
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_models" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_templates" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "fileData" BYTEA NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "ownerName" VARCHAR(200) NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_legacyId_key" ON "quotes"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "quote_models_legacyId_key" ON "quote_models"("legacyId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_payments" ADD CONSTRAINT "quote_payments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_history" ADD CONSTRAINT "quote_history_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_actions" ADD CONSTRAINT "sales_actions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
