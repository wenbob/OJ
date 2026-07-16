-- Preserve submissions and ranking points when an administrator removes a problem
-- from the active problem bank. Archived problems remain in the database for history.
ALTER TABLE "Problem" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "Problem_archivedAt_problemType_category_idx"
ON "Problem"("archivedAt", "problemType", "category");
