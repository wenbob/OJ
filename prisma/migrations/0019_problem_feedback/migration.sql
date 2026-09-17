CREATE TABLE "Feedback" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "authorId" INTEGER,
  "authorUsername" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FeedbackAttachment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "feedbackId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "data" BLOB NOT NULL,
  CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FeedbackReply" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "feedbackId" INTEGER NOT NULL,
  "administratorId" INTEGER,
  "administratorUsername" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackReply_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Feedback_authorId_createdAt_id_idx" ON "Feedback"("authorId", "createdAt", "id");
CREATE INDEX "Feedback_status_createdAt_id_idx" ON "Feedback"("status", "createdAt", "id");
CREATE UNIQUE INDEX "FeedbackAttachment_feedbackId_position_key" ON "FeedbackAttachment"("feedbackId", "position");
CREATE INDEX "FeedbackReply_feedbackId_createdAt_id_idx" ON "FeedbackReply"("feedbackId", "createdAt", "id");
CREATE INDEX "FeedbackReply_administratorId_idx" ON "FeedbackReply"("administratorId");
