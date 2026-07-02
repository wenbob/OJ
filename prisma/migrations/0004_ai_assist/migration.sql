ALTER TABLE "Exam" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiPracticeEnabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
