-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "preRegistered" BOOLEAN NOT NULL DEFAULT false,
    "showOnPortal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_groups" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "billing_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "number" VARCHAR(20) NOT NULL,
    "modality" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "observation" TEXT,
    "personId" TEXT,
    "personName" VARCHAR(200) NOT NULL,
    "personDocument" VARCHAR(20),
    "personType" VARCHAR(1) NOT NULL DEFAULT 'J',
    "sellerName" VARCHAR(200),
    "billingGroupId" TEXT,
    "paymentMethodId" TEXT,
    "billingDay" INTEGER NOT NULL,
    "dueType" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "adjustIndex" INTEGER,
    "allowAdjust" BOOLEAN NOT NULL DEFAULT true,
    "penaltyPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdBy" VARCHAR(200) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_invoices" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "contractId" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "netValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceCount" INTEGER NOT NULL DEFAULT 1,
    "canceled" BOOLEAN NOT NULL DEFAULT false,
    "taxPending" BOOLEAN NOT NULL DEFAULT false,
    "address" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_products" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productLegacyId" INTEGER,
    "description" VARCHAR(300) NOT NULL,
    "identifier" VARCHAR(60),
    "unitMeasure" INTEGER NOT NULL DEFAULT 3,
    "balanceSale" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceRental" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceGratuity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceWarranty" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "contract_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_history" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "isLog" BOOLEAN NOT NULL DEFAULT false,
    "userName" VARCHAR(200) NOT NULL DEFAULT '',

    CONSTRAINT "contract_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_legacyId_key" ON "payment_methods"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_groups_legacyId_key" ON "billing_groups"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_legacyId_key" ON "contracts"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

-- CreateIndex
CREATE INDEX "contracts_personId_idx" ON "contracts"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_invoices_legacyId_key" ON "contract_invoices"("legacyId");

-- CreateIndex
CREATE INDEX "contract_invoices_contractId_idx" ON "contract_invoices"("contractId");

-- CreateIndex
CREATE INDEX "contract_products_invoiceId_idx" ON "contract_products"("invoiceId");

-- CreateIndex
CREATE INDEX "contract_history_contractId_at_idx" ON "contract_history"("contractId", "at" DESC);

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_billingGroupId_fkey" FOREIGN KEY ("billingGroupId") REFERENCES "billing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_invoices" ADD CONSTRAINT "contract_invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_products" ADD CONSTRAINT "contract_products_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "contract_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_history" ADD CONSTRAINT "contract_history_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
