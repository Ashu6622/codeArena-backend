-- CreateTable
CREATE TABLE "problem_comments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_comments_problemId_createdAt_idx" ON "problem_comments"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "problem_comments_userId_idx" ON "problem_comments"("userId");

-- AddForeignKey
ALTER TABLE "problem_comments" ADD CONSTRAINT "problem_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_comments" ADD CONSTRAINT "problem_comments_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
