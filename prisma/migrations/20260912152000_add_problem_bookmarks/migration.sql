-- CreateTable
CREATE TABLE "problem_bookmarks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problem_bookmarks_userId_problemId_key" ON "problem_bookmarks"("userId", "problemId");

-- CreateIndex
CREATE INDEX "problem_bookmarks_problemId_idx" ON "problem_bookmarks"("problemId");

-- AddForeignKey
ALTER TABLE "problem_bookmarks" ADD CONSTRAINT "problem_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_bookmarks" ADD CONSTRAINT "problem_bookmarks_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
