CREATE TABLE "access_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "userName" VARCHAR(100) NOT NULL,
  "userEmail" VARCHAR(254) NOT NULL,
  "device" VARCHAR(16) NOT NULL,
  "userAgent" VARCHAR(512),
  "ip" VARCHAR(64),
  "locationStatus" VARCHAR(20) NOT NULL DEFAULT 'not_requested',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracy" DOUBLE PRECISION,
  "city" VARCHAR(160),
  "region" VARCHAR(160),
  "country" VARCHAR(2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_logs_location_check" CHECK (
    ("locationStatus" = 'shared' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    OR ("locationStatus" IN ('not_requested', 'denied', 'unavailable') AND "latitude" IS NULL AND "longitude" IS NULL AND "accuracy" IS NULL)
  )
);
CREATE INDEX "access_logs_createdAt_id_idx" ON "access_logs"("createdAt" DESC, "id");
CREATE INDEX "access_logs_userId_createdAt_idx" ON "access_logs"("userId", "createdAt" DESC);
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO "sidebar_items" ("key", "label", "href", "section", "sortOrder") VALUES ('log_acesso', 'Log de acesso', '/access-logs', 'admin', 1) ON CONFLICT ("key") DO NOTHING;
