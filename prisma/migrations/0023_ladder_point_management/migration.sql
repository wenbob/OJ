CREATE TABLE "StudentPointAdjustment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "studentId" INTEGER,
  "studentIdSnapshot" INTEGER NOT NULL,
  "studentUsername" TEXT NOT NULL,
  "administratorId" INTEGER,
  "administratorIdSnapshot" INTEGER NOT NULL,
  "administratorUsername" TEXT NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('add', 'deduct', 'set')),
  "inputPoints" INTEGER NOT NULL CHECK ("inputPoints" >= 0 AND ("mode" = 'set' OR "inputPoints" > 0)),
  "amount" INTEGER NOT NULL CHECK ("amount" != 0),
  "beforePoints" INTEGER NOT NULL CHECK ("beforePoints" >= 0),
  "afterPoints" INTEGER NOT NULL CHECK ("afterPoints" >= 0 AND "afterPoints" = "beforePoints" + "amount"),
  "reason" TEXT NOT NULL CHECK (length(trim("reason")) BETWEEN 1 AND 200),
  "requestId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPointAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StudentPointAdjustment_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudentPointAdjustment_requestId_key" ON "StudentPointAdjustment"("requestId");
CREATE INDEX "StudentPointAdjustment_studentId_idx" ON "StudentPointAdjustment"("studentId");
CREATE INDEX "StudentPointAdjustment_createdAt_id_idx" ON "StudentPointAdjustment"("createdAt", "id");
CREATE INDEX "StudentPointAdjustment_studentIdSnapshot_createdAt_id_idx" ON "StudentPointAdjustment"("studentIdSnapshot", "createdAt", "id");
CREATE INDEX "StudentPointAdjustment_mode_createdAt_id_idx" ON "StudentPointAdjustment"("mode", "createdAt", "id");
INSERT OR IGNORE INTO "SystemSetting" ("key", "value") VALUES ('__ladderTierConfig', '{"revision":"0","minPoints":[0,65,130,260,455,715,1040,1560]}');
