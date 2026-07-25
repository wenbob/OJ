ALTER TABLE "Exam" ADD COLUMN "createdById" INTEGER
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Exam_createdById_createdAt_idx"
ON "Exam"("createdById", "createdAt");
