PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "SubmissionCaseResult";
DROP TABLE IF EXISTS "Submission";
DROP TABLE IF EXISTS "ExamRecord";
DROP TABLE IF EXISTS "ExamProblem";
DROP TABLE IF EXISTS "Exam";
DROP TABLE IF EXISTS "TestCase";
DROP TABLE IF EXISTS "Problem";
DROP TABLE IF EXISTS "StudentProfile";
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS "SystemSetting";

CREATE TABLE "User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "StudentProfile" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "customTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

CREATE TABLE "Problem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "inputDescription" TEXT NOT NULL,
  "outputDescription" TEXT NOT NULL,
  "sampleInput" TEXT NOT NULL,
  "sampleOutput" TEXT NOT NULL,
  "dataRange" TEXT,
  "difficulty" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "problemType" TEXT NOT NULL DEFAULT 'programming',
  "objectiveItems" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Problem_problemType_category_idx" ON "Problem"("problemType", "category");

CREATE TABLE "Exam" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "durationMin" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "examType" TEXT NOT NULL DEFAULT 'programming',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Exam_examType_status_idx" ON "Exam"("examType", "status");

CREATE TABLE "TestCase" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "problemId" INTEGER NOT NULL,
  "input" TEXT NOT NULL,
  "output" TEXT NOT NULL,
  "isSample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ExamProblem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "examId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER NOT NULL DEFAULT 100,
  CONSTRAINT "ExamProblem_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExamProblem_examId_problemId_key" ON "ExamProblem"("examId", "problemId");
CREATE INDEX "ExamProblem_examId_order_idx" ON "ExamProblem"("examId", "order");

CREATE TABLE "Submission" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "examId" INTEGER,
  "submissionType" TEXT NOT NULL DEFAULT 'practice',
  "code" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "passedCount" INTEGER NOT NULL DEFAULT 0,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "runtimeMs" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Submission_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");
CREATE INDEX "Submission_problemId_createdAt_idx" ON "Submission"("problemId", "createdAt");
CREATE INDEX "Submission_submissionType_userId_createdAt_idx" ON "Submission"("submissionType", "userId", "createdAt");
CREATE INDEX "Submission_submissionType_createdAt_idx" ON "Submission"("submissionType", "createdAt");
CREATE INDEX "Submission_examId_userId_problemId_idx" ON "Submission"("examId", "userId", "problemId");

CREATE TABLE "SubmissionCaseResult" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "submissionId" INTEGER NOT NULL,
  "caseIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "expectedOutput" TEXT NOT NULL,
  "actualOutput" TEXT,
  "runtimeMs" INTEGER,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionCaseResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SubmissionCaseResult_submissionId_caseIndex_idx" ON "SubmissionCaseResult"("submissionId", "caseIndex");

CREATE TABLE "ExamRecord" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "examId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "totalScore" INTEGER,
  CONSTRAINT "ExamRecord_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExamRecord_examId_userId_key" ON "ExamRecord"("examId", "userId");
CREATE INDEX "ExamRecord_userId_status_idx" ON "ExamRecord"("userId", "status");
CREATE INDEX "ExamRecord_examId_status_idx" ON "ExamRecord"("examId", "status");

CREATE TABLE "SystemSetting" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

PRAGMA foreign_keys=ON;
