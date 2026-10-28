-- CreateTable
CREATE TABLE "news_posts" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "toAll" BOOLEAN NOT NULL DEFAULT true,
    "authorId" TEXT,
    "authorName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_targets" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "news_targets_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "news_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" VARCHAR(200) NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_posts_createdAt_idx" ON "news_posts"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "news_targets_userId_idx" ON "news_targets"("userId");

-- CreateIndex
CREATE INDEX "news_comments_postId_createdAt_idx" ON "news_comments"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "news_targets" ADD CONSTRAINT "news_targets_postId_fkey" FOREIGN KEY ("postId") REFERENCES "news_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_comments" ADD CONSTRAINT "news_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "news_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
