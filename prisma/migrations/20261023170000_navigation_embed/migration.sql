ALTER TABLE "sidebar_items" ADD COLUMN "embedUrl" TEXT;

DO $$
DECLARE item RECORD; base TEXT; candidate TEXT; suffix INTEGER;
BEGIN
  FOR item IN SELECT "key", "label" FROM "sidebar_items" WHERE "section" = 'main' AND "href" LIKE '/items/%' ORDER BY "key" LOOP
    base := trim(both '-' from regexp_replace(translate(lower(item.label), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'));
    IF base = '' THEN base := 'pagina'; END IF;
    candidate := '/items/' || base;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM "sidebar_items" WHERE "href" = candidate AND "key" <> item.key) LOOP
      candidate := '/items/' || base || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE "sidebar_items" SET "href" = candidate WHERE "key" = item.key;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "sidebar_items_href_key" ON "sidebar_items"("href");
