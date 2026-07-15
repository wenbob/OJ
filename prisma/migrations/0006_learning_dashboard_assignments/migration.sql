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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    CONSTRAINT "LearningAssignmentProblem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "LearningAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningAssignmentProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LearningInsightSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "window" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningInsightSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Submission" ADD COLUMN "learningAssignmentId" INTEGER REFERENCES "LearningAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LearningAssignment_studentId_status_createdAt_idx" ON "LearningAssignment"("studentId", "status", "createdAt");
CREATE INDEX "LearningAssignment_createdById_createdAt_idx" ON "LearningAssignment"("createdById", "createdAt");
CREATE UNIQUE INDEX "LearningAssignmentProblem_assignmentId_problemId_key" ON "LearningAssignmentProblem"("assignmentId", "problemId");
CREATE INDEX "LearningAssignmentProblem_assignmentId_order_idx" ON "LearningAssignmentProblem"("assignmentId", "order");
CREATE INDEX "LearningAssignmentProblem_problemId_idx" ON "LearningAssignmentProblem"("problemId");
CREATE UNIQUE INDEX "LearningInsightSnapshot_studentId_window_key" ON "LearningInsightSnapshot"("studentId", "window");
CREATE INDEX "LearningInsightSnapshot_studentId_generatedAt_idx" ON "LearningInsightSnapshot"("studentId", "generatedAt");
CREATE INDEX "Submission_learningAssignmentId_userId_problemId_idx" ON "Submission"("learningAssignmentId", "userId", "problemId");
