-- CreateTable
CREATE TABLE "ops_events" (
    "id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "orderId" TEXT,
    "orderNumber" INTEGER,
    "clientName" VARCHAR(200),
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "text" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_events_createdAt_idx" ON "ops_events"("createdAt" DESC);
