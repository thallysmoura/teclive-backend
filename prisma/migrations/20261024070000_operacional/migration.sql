-- CreateTable
CREATE TABLE "op_causes" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_causes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_solutions" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_defects" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "description" VARCHAR(200) NOT NULL,
    "serviceMinutes" INTEGER NOT NULL DEFAULT 0,
    "closingMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_questionnaires" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "legacyId" INTEGER,
    "number" INTEGER NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 1,
    "purpose" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "defectName" VARCHAR(200),
    "personId" TEXT,
    "personName" VARCHAR(200) NOT NULL,
    "personNickname" VARCHAR(200),
    "personType" VARCHAR(1) NOT NULL DEFAULT 'F',
    "address" JSONB,
    "contact" JSONB,
    "openedBy" VARCHAR(200) NOT NULL DEFAULT '—',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "interruptedAt" TIMESTAMP(3),
    "scheduleStart" TIMESTAMP(3),
    "scheduleEnd" TIMESTAMP(3),
    "technicians" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quoteNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "technicalSheet" TEXT,
    "totalServices" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalProducts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "causeName" VARCHAR(200),
    "solutionName" VARCHAR(200),
    "paymentMethod" VARCHAR(100),
    "installments" INTEGER,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "op_causes_legacyId_key" ON "op_causes"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "op_solutions_legacyId_key" ON "op_solutions"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "op_defects_legacyId_key" ON "op_defects"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "op_questionnaires_legacyId_key" ON "op_questionnaires"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_legacyId_key" ON "service_orders"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_number_key" ON "service_orders"("number");

-- CreateIndex
CREATE INDEX "service_orders_status_idx" ON "service_orders"("status");

-- CreateIndex
CREATE INDEX "service_orders_scheduleStart_idx" ON "service_orders"("scheduleStart");

