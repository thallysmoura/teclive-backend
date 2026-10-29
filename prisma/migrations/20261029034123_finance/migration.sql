-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(40) NOT NULL DEFAULT 'Conta Corrente',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "opening" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_categories" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(1) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fin_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_accounts" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(1) NOT NULL,
    "number" VARCHAR(12),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "installment" VARCHAR(10),
    "description" VARCHAR(300) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "paidValue" DECIMAL(14,2),
    "status" VARCHAR(10) NOT NULL DEFAULT 'ABERTA',
    "paymentMethod" VARCHAR(80),
    "cashAccountId" TEXT,
    "settledAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "invoiceNumber" INTEGER,
    "note" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT,
    "createdBy" VARCHAR(200) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_centers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "result_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_logs" (
    "id" TEXT NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_operations" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "personName" VARCHAR(250) NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fin_categories_kind_parentId_idx" ON "fin_categories"("kind", "parentId");

-- CreateIndex
CREATE INDEX "fin_accounts_kind_dueDate_idx" ON "fin_accounts"("kind", "dueDate" DESC);

-- CreateIndex
CREATE INDEX "cash_movements_cashAccountId_date_idx" ON "cash_movements"("cashAccountId", "date" DESC);

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "cash_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
