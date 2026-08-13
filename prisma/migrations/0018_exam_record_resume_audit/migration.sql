ALTER TABLE "ExamRecord" ADD COLUMN "resumeLoginAllowed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ExamRecordResumeAudit" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "examRecordId" INTEGER NOT NULL,
  "operatorId" INTEGER,
  "operatorUsername" TEXT NOT NULL,
  "operatorRole" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamRecordResumeAudit_examRecordId_fkey" FOREIGN KEY ("examRecordId") REFERENCES "ExamRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamRecordResumeAudit_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ExamRecordResumeAudit_examRecordId_createdAt_idx" ON "ExamRecordResumeAudit"("examRecordId", "createdAt");
CREATE INDEX "ExamRecordResumeAudit_operatorId_createdAt_idx" ON "ExamRecordResumeAudit"("operatorId", "createdAt");
