-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_adjustments" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userName" VARCHAR(200) NOT NULL,
    "filterType" VARCHAR(60) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 0,
    "indexId" INTEGER,
    "groupName" VARCHAR(120),
    "percent" DECIMAL(8,4) NOT NULL,
    "rounded" BOOLEAN NOT NULL DEFAULT false,
    "contractCount" INTEGER NOT NULL DEFAULT 0,
    "valueBefore" DECIMAL(14,2) NOT NULL,
    "valueAfter" DECIMAL(14,2) NOT NULL,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "contract_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_charges" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNo" VARCHAR(20) NOT NULL,
    "personName" VARCHAR(200) NOT NULL,
    "kind" INTEGER NOT NULL DEFAULT 0,
    "competence" VARCHAR(7) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdBy" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_cancellations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNo" VARCHAR(20) NOT NULL,
    "personName" VARCHAR(200) NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "fine" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdBy" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delinquency_blocks" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "personName" VARCHAR(200) NOT NULL,
    "days" INTEGER NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delinquency_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_charges_competence_idx" ON "contract_charges"("competence");
