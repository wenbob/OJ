CREATE TABLE "RewardDraw" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "sourceProblemId" INTEGER NOT NULL,
  "sourceSubmissionId" INTEGER NOT NULL,
  "problemTitle" TEXT NOT NULL,
  "problemType" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "minPoints" INTEGER NOT NULL CHECK ("minPoints" > 0),
  "maxPoints" INTEGER NOT NULL CHECK ("maxPoints" >= "minPoints"),
  "amount" INTEGER CHECK ("amount" >= "minPoints" AND "amount" <= "maxPoints"),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "drawnAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RewardDraw_sourceSubmissionId_key" ON "RewardDraw"("sourceSubmissionId");
CREATE UNIQUE INDEX "RewardDraw_userId_sourceProblemId_key" ON "RewardDraw"("userId", "sourceProblemId");
CREATE INDEX "RewardDraw_userId_createdAt_id_idx" ON "RewardDraw"("userId", "createdAt", "id");
CREATE TABLE "RewardChallenge" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "rewardId" INTEGER NOT NULL,
  "targetProblemId" INTEGER NOT NULL,
  "targetTitle" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','expired','cancelled','completed')),
  "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  "completedSubmissionId" INTEGER,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("rewardId") REFERENCES "RewardDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RewardChallenge_one_active_per_user" ON "RewardChallenge"("userId") WHERE "status" = 'active';
CREATE INDEX "RewardChallenge_userId_targetProblemId_status_idx" ON "RewardChallenge"("userId", "targetProblemId", "status");
CREATE INDEX "RewardChallenge_rewardId_id_idx" ON "RewardChallenge"("rewardId", "id");
CREATE TABLE "PointReward" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "rewardId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('draw','double')),
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("rewardId") REFERENCES "RewardDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PointReward_rewardId_kind_key" ON "PointReward"("rewardId", "kind");
CREATE INDEX "PointReward_userId_idx" ON "PointReward"("userId");
INSERT OR IGNORE INTO "SystemSetting" ("key", "value") VALUES ('rewardsEnabled', 'true'), ('rewardMinPoints', '1'), ('rewardMaxPoints', '10');
