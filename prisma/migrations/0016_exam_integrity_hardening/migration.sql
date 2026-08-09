ALTER TABLE "ExamProblem" ADD COLUMN "snapshotTitle" TEXT;
ALTER TABLE "ExamProblem" ADD COLUMN "snapshotProblemType" TEXT;
ALTER TABLE "ExamProblem" ADD COLUMN "snapshotObjectiveItems" TEXT;
ALTER TABLE "ExamProblem" ADD COLUMN "snapshotScore" INTEGER;
ALTER TABLE "ExamProblem" ADD COLUMN "snapshotAt" DATETIME;

CREATE INDEX "Submission_userId_problemId_createdAt_idx"
ON "Submission"("userId", "problemId", "createdAt");

CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

UPDATE "ExamProblem"
SET
  "snapshotTitle" = (
    SELECT "Problem"."title"
    FROM "Problem"
    WHERE "Problem"."id" = "ExamProblem"."problemId"
  ),
  "snapshotProblemType" = (
    SELECT "Problem"."problemType"
    FROM "Problem"
    WHERE "Problem"."id" = "ExamProblem"."problemId"
  ),
  "snapshotObjectiveItems" = (
    SELECT "Problem"."objectiveItems"
    FROM "Problem"
    WHERE "Problem"."id" = "ExamProblem"."problemId"
  ),
  "snapshotScore" = "score",
  "snapshotAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "Exam"
  WHERE "Exam"."id" = "ExamProblem"."examId"
    AND "Exam"."status" IN ('published', 'ended')
);

CREATE TRIGGER "User_keep_last_admin_on_delete"
BEFORE DELETE ON "User"
FOR EACH ROW
WHEN OLD."role" = 'admin'
  AND (SELECT COUNT(*) FROM "User" WHERE "role" = 'admin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_ADMIN_REQUIRED');
END;

CREATE TRIGGER "User_keep_last_admin_on_role_update"
BEFORE UPDATE OF "role" ON "User"
FOR EACH ROW
WHEN OLD."role" = 'admin'
  AND NEW."role" <> 'admin'
  AND (SELECT COUNT(*) FROM "User" WHERE "role" = 'admin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_ADMIN_REQUIRED');
END;
