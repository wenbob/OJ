ALTER TABLE "Problem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Problem"
SET "sortOrder" = "id";

CREATE INDEX "Problem_archivedAt_problemType_sortOrder_id_idx"
ON "Problem"("archivedAt", "problemType", "sortOrder", "id");

CREATE TABLE "ProblemCategoryOrder" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "problemType" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProblemCategoryOrder_problemType_category_key"
ON "ProblemCategoryOrder"("problemType", "category");

CREATE INDEX "ProblemCategoryOrder_problemType_sortOrder_idx"
ON "ProblemCategoryOrder"("problemType", "sortOrder");
