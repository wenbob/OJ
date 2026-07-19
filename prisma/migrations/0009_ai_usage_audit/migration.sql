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
  CONSTRAINT "AiConversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiConversation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiConversation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
  CONSTRAINT "AiConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiConversationTurn_requestId_key" ON "AiConversationTurn"("requestId");
CREATE INDEX "AiConversationTurn_conversationId_createdAt_idx" ON "AiConversationTurn"("conversationId", "createdAt");
CREATE INDEX "AiConversationTurn_status_createdAt_idx" ON "AiConversationTurn"("status", "createdAt");
CREATE INDEX "AiConversationTurn_createdAt_idx" ON "AiConversationTurn"("createdAt");

INSERT INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiConversationRetentionDays', '180', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT("key") DO NOTHING;
