ALTER TABLE "Exam" ADD COLUMN "archivedAt" DATETIME;
CREATE INDEX "Exam_archivedAt_status_createdAt_idx" ON "Exam"("archivedAt", "status", "createdAt");

CREATE TABLE "ExamArchiveAudit" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "examId" INTEGER NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('archive', 'restore')),
  "operatorId" INTEGER,
  "operatorUsername" TEXT NOT NULL,
  "operatorRole" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ExamArchiveAudit_examId_createdAt_id_idx" ON "ExamArchiveAudit"("examId", "createdAt", "id");

-- Keep historical records and submission links even if another caller bypasses the API.
CREATE TRIGGER "Exam_delete_history_guard"
BEFORE DELETE ON "Exam"
WHEN OLD."status" <> 'draft' OR OLD."archivedAt" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "ExamRecord" WHERE "examId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "Submission" WHERE "examId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "AiConversation" WHERE "examId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "ExamArchiveAudit" WHERE "examId" = OLD."id")
BEGIN
  SELECT RAISE(ABORT, 'EXAM_HISTORY_REQUIRED');
END;

CREATE TRIGGER "Exam_archive_state_guard"
BEFORE UPDATE OF "archivedAt", "status" ON "Exam"
WHEN NEW."archivedAt" IS NOT NULL AND NEW."status" <> 'ended'
BEGIN
  SELECT RAISE(ABORT, 'EXAM_ARCHIVE_REQUIRES_ENDED');
END;

CREATE TRIGGER "Exam_ended_state_guard"
BEFORE UPDATE OF "status" ON "Exam"
WHEN OLD."status" = 'ended' AND NEW."status" <> 'ended'
BEGIN
  SELECT RAISE(ABORT, 'EXAM_ENDED_IMMUTABLE');
END;
