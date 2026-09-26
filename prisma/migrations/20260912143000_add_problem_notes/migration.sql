-- CreateTable
CREATE TABLE "problem_notes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problem_notes_userId_problemId_key" ON "problem_notes"("userId", "problemId");

-- CreateIndex
CREATE INDEX "problem_notes_problemId_idx" ON "problem_notes"("problemId");

-- AddForeignKey
ALTER TABLE "problem_notes" ADD CONSTRAINT "problem_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_notes" ADD CONSTRAINT "problem_notes_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
