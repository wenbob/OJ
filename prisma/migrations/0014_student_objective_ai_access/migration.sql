ALTER TABLE "StudentProfile"
ADD COLUMN "objectiveAiAccessEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AiConversationTurn"
ADD COLUMN "aiProfile" TEXT NOT NULL DEFAULT 'programming';

ALTER TABLE "AiConversationTurn"
ADD COLUMN "objectiveItemIndex" INTEGER;

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveStudentCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiStudentObjectiveExplanationEnabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiStaffProgrammingAssistEnabled', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
