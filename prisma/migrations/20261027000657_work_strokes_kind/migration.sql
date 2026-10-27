-- AlterTable
ALTER TABLE "work_points" ADD COLUMN     "kind" VARCHAR(8) NOT NULL DEFAULT 'point';

-- CreateTable
CREATE TABLE "work_strokes" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "color" VARCHAR(9) NOT NULL,
    "points" JSONB NOT NULL,
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_strokes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_strokes_planId_idx" ON "work_strokes"("planId");

-- AddForeignKey
ALTER TABLE "work_strokes" ADD CONSTRAINT "work_strokes_planId_fkey" FOREIGN KEY ("planId") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
