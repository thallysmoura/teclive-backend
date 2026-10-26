-- CreateTable
CREATE TABLE "work_plans" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_points" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_plans_orderId_createdAt_idx" ON "work_plans"("orderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "work_points_planId_idx" ON "work_points"("planId");

-- AddForeignKey
ALTER TABLE "work_points" ADD CONSTRAINT "work_points_planId_fkey" FOREIGN KEY ("planId") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
