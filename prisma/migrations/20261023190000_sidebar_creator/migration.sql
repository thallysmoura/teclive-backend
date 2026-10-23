ALTER TABLE "sidebar_items" ADD COLUMN "createdById" TEXT;
CREATE INDEX "sidebar_items_createdById_idx" ON "sidebar_items"("createdById");
ALTER TABLE "sidebar_items" ADD CONSTRAINT "sidebar_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
