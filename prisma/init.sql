PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "SubmissionCaseResult";
DROP TABLE IF EXISTS "Submission";
DROP TABLE IF EXISTS "LearningAssignmentProblem";
DROP TABLE IF EXISTS "LearningAssignment";
DROP TABLE IF EXISTS "LearningInsightSnapshot";
DROP TABLE IF EXISTS "ObjectiveAiExplanation";
DROP TABLE IF EXISTS "AiConversationTurn";
DROP TABLE IF EXISTS "AiConversation";
DROP TABLE IF EXISTS "ExamRecord";
DROP TABLE IF EXISTS "ExamProblem";
DROP TABLE IF EXISTS "Exam";
DROP TABLE IF EXISTS "TestCase";
DROP TABLE IF EXISTS "ProblemCategoryOrder";
DROP TABLE IF EXISTS "Problem";
DROP TABLE IF EXISTS "StudentProfile";
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS "SystemSetting";

CREATE TABLE "User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "StudentProfile" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "customTitle" TEXT,
  "aiAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
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
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "objectiveItems" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Problem_problemType_category_idx" ON "Problem"("problemType", "category");
CREATE INDEX "Problem_archivedAt_problemType_category_idx" ON "Problem"("archivedAt", "problemType", "category");
CREATE INDEX "Problem_archivedAt_problemType_sortOrder_id_idx" ON "Problem"("archivedAt", "problemType", "sortOrder", "id");

CREATE TABLE "ObjectiveAiExplanation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "problemId" INTEGER NOT NULL,
  "itemIndex" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "providerFingerprint" TEXT NOT NULL,
  "correctAnswer" TEXT NOT NULL,
  "explanationJson" TEXT NOT NULL,
  "model" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "generatedById" INTEGER,
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ObjectiveAiExplanation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ObjectiveAiExplanation_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ObjectiveAiExplanation_problemId_itemIndex_key" ON "ObjectiveAiExplanation"("problemId", "itemIndex");
CREATE INDEX "ObjectiveAiExplanation_problemId_generatedAt_idx" ON "ObjectiveAiExplanation"("problemId", "generatedAt");
CREATE INDEX "ObjectiveAiExplanation_generatedById_generatedAt_idx" ON "ObjectiveAiExplanation"("generatedById", "generatedAt");

CREATE TABLE "ProblemCategoryOrder" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "problemType" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProblemCategoryOrder_problemType_category_key" ON "ProblemCategoryOrder"("problemType", "category");
CREATE INDEX "ProblemCategoryOrder_problemType_sortOrder_idx" ON "ProblemCategoryOrder"("problemType", "sortOrder");

CREATE TABLE "Exam" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "durationMin" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "examType" TEXT NOT NULL DEFAULT 'programming',
  "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdById" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Exam_examType_status_idx" ON "Exam"("examType", "status");
CREATE INDEX "Exam_createdById_createdAt_idx" ON "Exam"("createdById", "createdAt");

CREATE TABLE "AiConversation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "studentId" INTEGER NOT NULL,
  "problemId" INTEGER,
  "examId" INTEGER,
  "clientConversationId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "problemTitle" TEXT NOT NULL,
  "examTitle" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiConversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiConversation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiConversation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiConversation_clientConversationId_key" ON "AiConversation"("clientConversationId");
CREATE INDEX "AiConversation_studentId_lastMessageAt_idx" ON "AiConversation"("studentId", "lastMessageAt");
CREATE INDEX "AiConversation_problemId_lastMessageAt_idx" ON "AiConversation"("problemId", "lastMessageAt");
CREATE INDEX "AiConversation_examId_lastMessageAt_idx" ON "AiConversation"("examId", "lastMessageAt");
CREATE INDEX "AiConversation_lastMessageAt_idx" ON "AiConversation"("lastMessageAt");

CREATE TABLE "AiConversationTurn" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "conversationId" INTEGER NOT NULL,
  "requestId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "userContent" TEXT NOT NULL,
  "assistantContent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "errorMessage" TEXT,
  "latencyMs" INTEGER,
  "providerCallCount" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "AiConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiConversationTurn_requestId_key" ON "AiConversationTurn"("requestId");
CREATE INDEX "AiConversationTurn_conversationId_createdAt_idx" ON "AiConversationTurn"("conversationId", "createdAt");
CREATE INDEX "AiConversationTurn_status_createdAt_idx" ON "AiConversationTurn"("status", "createdAt");
CREATE INDEX "AiConversationTurn_createdAt_idx" ON "AiConversationTurn"("createdAt");

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

CREATE TABLE "LearningAssignment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "studentId" INTEGER NOT NULL,
  "createdById" INTEGER,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LearningAssignment_studentId_status_createdAt_idx" ON "LearningAssignment"("studentId", "status", "createdAt");
CREATE INDEX "LearningAssignment_createdById_createdAt_idx" ON "LearningAssignment"("createdById", "createdAt");

CREATE TABLE "LearningAssignmentProblem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "assignmentId" INTEGER NOT NULL,
  "problemId" INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  "problemTitle" TEXT NOT NULL,
  "problemCategory" TEXT NOT NULL,
  "problemDifficulty" TEXT NOT NULL,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningAssignmentProblem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "LearningAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningAssignmentProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningAssignmentProblem_assignmentId_problemId_key" ON "LearningAssignmentProblem"("assignmentId", "problemId");
CREATE INDEX "LearningAssignmentProblem_assignmentId_order_idx" ON "LearningAssignmentProblem"("assignmentId", "order");
CREATE INDEX "LearningAssignmentProblem_problemId_idx" ON "LearningAssignmentProblem"("problemId");

CREATE TABLE "LearningInsightSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "studentId" INTEGER NOT NULL,
  "window" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningInsightSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningInsightSnapshot_studentId_window_key" ON "LearningInsightSnapshot"("studentId", "window");
CREATE INDEX "LearningInsightSnapshot_studentId_generatedAt_idx" ON "LearningInsightSnapshot"("studentId", "generatedAt");

CREATE TABLE "Submission" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "examId" INTEGER,
  "learningAssignmentId" INTEGER,
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
  CONSTRAINT "Submission_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Submission_learningAssignmentId_fkey" FOREIGN KEY ("learningAssignmentId") REFERENCES "LearningAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");
CREATE INDEX "Submission_problemId_createdAt_idx" ON "Submission"("problemId", "createdAt");
CREATE INDEX "Submission_submissionType_userId_createdAt_idx" ON "Submission"("submissionType", "userId", "createdAt");
CREATE INDEX "Submission_submissionType_createdAt_idx" ON "Submission"("submissionType", "createdAt");
CREATE INDEX "Submission_examId_userId_problemId_idx" ON "Submission"("examId", "userId", "problemId");
CREATE INDEX "Submission_learningAssignmentId_userId_problemId_idx" ON "Submission"("learningAssignmentId", "userId", "problemId");

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

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiPracticeEnabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveExplanationEnabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProvider', 'deepseek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiBaseUrl', 'https://api.deepseek.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiModel', 'deepseek-v4-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiThinkingMode', 'enabled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiCustomThinkingProtocol', 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveProvider', 'deepseek', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveBaseUrl', 'https://api.deepseek.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveModel', 'deepseek-v4-pro', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveThinkingMode', 'enabled', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveCustomThinkingProtocol', 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingStudentCooldownSeconds', '20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingTeacherCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingAdminCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveTeacherCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveAdminCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('browserTitle', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('browserIcon', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiConversationRetentionDays', '180', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA foreign_keys=ON;
