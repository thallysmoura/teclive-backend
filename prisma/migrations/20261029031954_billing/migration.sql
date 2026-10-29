-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" VARCHAR(1) NOT NULL,
    "origin" VARCHAR(10) NOT NULL,
    "originRef" VARCHAR(20),
    "personId" TEXT,
    "personName" VARCHAR(250) NOT NULL,
    "competence" VARCHAR(5) NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "createdBy" VARCHAR(200) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "titleGenerated" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(10) NOT NULL DEFAULT 'FATURADA',
    "nfseNumber" INTEGER,
    "nfeNumber" VARCHAR(20),
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_records" (
    "rps" INTEGER NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "lote" VARCHAR(10) NOT NULL,
    "nfseNumber" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(1) NOT NULL,

    CONSTRAINT "nfse_records_pkey" PRIMARY KEY ("rps")
);

-- CreateTable
CREATE TABLE "nfe_records" (
    "number" INTEGER NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "status" VARCHAR(1) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "kindLabel" VARCHAR(60) NOT NULL,
    "invoiceNumber" INTEGER,
    "exitDate" TIMESTAMP(3),
    "accessKey" VARCHAR(60) NOT NULL,
    "total" DECIMAL(14,2),

    CONSTRAINT "nfe_records_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "return_notes" (
    "id" TEXT NOT NULL,
    "number" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "kindLabel" VARCHAR(60) NOT NULL,
    "originNf" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_notes" (
    "id" TEXT NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "supplierName" VARCHAR(250) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_kind_number_idx" ON "invoices"("kind", "number" DESC);
