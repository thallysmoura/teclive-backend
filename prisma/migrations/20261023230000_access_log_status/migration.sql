ALTER TABLE "access_logs" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "access_logs" ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'VALID';
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_status_check" CHECK ("status" IN ('VALID', 'INVALID'));
