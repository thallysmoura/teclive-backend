ALTER TABLE "sidebar_items" ADD COLUMN "parentKey" TEXT;
CREATE INDEX "sidebar_items_parentKey_idx" ON "sidebar_items"("parentKey");
ALTER TABLE "sidebar_items" ADD CONSTRAINT "sidebar_items_parentKey_fkey" FOREIGN KEY ("parentKey") REFERENCES "sidebar_items"("key") ON DELETE CASCADE ON UPDATE CASCADE;
