-- Prisma stores epoch milliseconds; older/manual SQLite inserts may use text dates.
ALTER TABLE "RewardDraw" ADD COLUMN "offerExpiresAt" DATETIME;
UPDATE "RewardDraw"
SET "offerExpiresAt" = (CASE WHEN typeof(COALESCE("drawnAt", "createdAt")) IN ('integer', 'real') THEN CAST(COALESCE("drawnAt", "createdAt") AS INTEGER) ELSE CAST(ROUND((julianday(COALESCE("drawnAt", "createdAt")) - 2440587.5) * 86400000) AS INTEGER) END) + 86400000
WHERE "amount" IS NOT NULL;

-- Settle legacy targets archived before this migration, using the actual archive
-- time rather than migration time. Challenge completion deadlines never change.
WITH archived AS (
  SELECT c."id",
    (CASE WHEN typeof(p."archivedAt") IN ('integer', 'real') THEN CAST(p."archivedAt" AS INTEGER) ELSE CAST(ROUND((julianday(p."archivedAt") - 2440587.5) * 86400000) AS INTEGER) END) AS archiveMs,
    (CASE WHEN typeof(c."acceptedAt") IN ('integer', 'real') THEN CAST(c."acceptedAt" AS INTEGER) ELSE CAST(ROUND((julianday(c."acceptedAt") - 2440587.5) * 86400000) AS INTEGER) END) AS acceptedMs,
    (CASE WHEN typeof(c."expiresAt") IN ('integer', 'real') THEN CAST(c."expiresAt" AS INTEGER) ELSE CAST(ROUND((julianday(c."expiresAt") - 2440587.5) * 86400000) AS INTEGER) END) AS expiresMs
  FROM "RewardChallenge" c JOIN "Problem" p ON p."id" = c."targetProblemId"
  WHERE c."status" = 'active' AND p."archivedAt" IS NOT NULL
)
UPDATE "RewardChallenge"
SET "status" = CASE WHEN (SELECT archiveMs >= acceptedMs AND archiveMs <= expiresMs FROM archived WHERE archived."id" = "RewardChallenge"."id")
  THEN 'cancelled' ELSE 'expired' END
WHERE "id" IN (SELECT "id" FROM archived);

WITH cancelledOffers AS (
  SELECT c."rewardId", (CASE WHEN typeof(p."archivedAt") IN ('integer', 'real') THEN CAST(p."archivedAt" AS INTEGER) ELSE CAST(ROUND((julianday(p."archivedAt") - 2440587.5) * 86400000) AS INTEGER) END) + 86400000 AS deadline
  FROM "RewardChallenge" c JOIN "Problem" p ON p."id" = c."targetProblemId"
  WHERE c."status" = 'cancelled' AND p."archivedAt" IS NOT NULL
    AND c."id" = (SELECT MAX(latest."id") FROM "RewardChallenge" latest WHERE latest."rewardId" = c."rewardId")
)
UPDATE "RewardDraw"
SET "offerExpiresAt" = (SELECT deadline FROM cancelledOffers WHERE cancelledOffers."rewardId" = "RewardDraw"."id")
WHERE "amount" IS NOT NULL AND "id" IN (SELECT "rewardId" FROM cancelledOffers);
