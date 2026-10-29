-- CreateTable
CREATE TABLE "work_checklists" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "userName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneBy" VARCHAR(200),
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "work_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_checklists_planId_idx" ON "work_checklists"("planId");

-- CreateIndex
CREATE INDEX "work_checklist_items_checklistId_idx" ON "work_checklist_items"("checklistId");

-- AddForeignKey
ALTER TABLE "work_checklists" ADD CONSTRAINT "work_checklists_planId_fkey" FOREIGN KEY ("planId") REFERENCES "work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_checklist_items" ADD CONSTRAINT "work_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "work_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
