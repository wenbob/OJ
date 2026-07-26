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
  CONSTRAINT "ObjectiveAiExplanation_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ObjectiveAiExplanation_generatedById_fkey"
    FOREIGN KEY ("generatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ObjectiveAiExplanation_problemId_itemIndex_key"
ON "ObjectiveAiExplanation"("problemId", "itemIndex");

CREATE INDEX "ObjectiveAiExplanation_problemId_generatedAt_idx"
ON "ObjectiveAiExplanation"("problemId", "generatedAt");

CREATE INDEX "ObjectiveAiExplanation_generatedById_generatedAt_idx"
ON "ObjectiveAiExplanation"("generatedById", "generatedAt");

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES (
  'aiObjectiveExplanationEnabled',
  'false',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
