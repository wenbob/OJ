import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getLadderSettings, getLadderSettingsForRender } from "./ladderSettings";
import { DEFAULT_RANK_TIERS, getRankTierTitle, RANK_POINT_PER_UNIQUE_ACCEPTED, type RankTier } from "./ladderShared";
export { getRankTierProgress, getRankTierTitle, RANK_POINT_PER_UNIQUE_ACCEPTED } from "./ladderShared";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const CUSTOM_TITLE_MAX_LENGTH = 20;

export const rankTiers = DEFAULT_RANK_TIERS;

export type RankingUserInput = {
  id: number;
  username: string;
  role: string;
  studentProfile?: {
    customTitle: string | null;
  } | null;
};

export type RankingSubmissionInput = {
  problemId: number;
  status: string;
  userId: number;
};

export type StudentRankingEntry = {
  acCount: number;
  acceptedSubmissionCount: number;
  customTitle: string | null;
  displayTitle: string;
  points: number;
  basePoints: number;
  rewardPoints: number;
  rank: number;
  tierTitle: string;
  userId: number;
  username: string;
};

export type StudentRankingSummary = Omit<StudentRankingEntry, "rank">;

export type RankTierProgress = {
  acceptedProblemsToNextTier: number;
  currentTierMinPoints: number;
  currentTierTitle: string;
  isMaxTier: boolean;
  nextTierMinPoints: number | null;
  nextTierTitle: string | null;
  pointsForCurrentTier: number;
  pointsIntoTier: number;
  pointsToNextTier: number;
  progressPercent: number;
};

function compareStudentRankingEntries(
  left: StudentRankingSummary,
  right: StudentRankingSummary,
) {
  if (right.points !== left.points) return right.points - left.points;
  if (right.acCount !== left.acCount) return right.acCount - left.acCount;
  if (right.acceptedSubmissionCount !== left.acceptedSubmissionCount) {
    return right.acceptedSubmissionCount - left.acceptedSubmissionCount;
  }
  const usernameOrder = left.username.localeCompare(right.username, "zh-Hans-CN");
  if (usernameOrder !== 0) return usernameOrder;
  return left.userId - right.userId;
}

function assignStudentRanks(
  summaries: StudentRankingSummary[],
): StudentRankingEntry[] {
  return summaries
    .sort(compareStudentRankingEntries)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function normalizeCustomTitle(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function validateCustomTitle(value: string | null) {
  if (value && value.length > CUSTOM_TITLE_MAX_LENGTH) {
    return `自定义头衔不能超过 ${CUSTOM_TITLE_MAX_LENGTH} 个字符`;
  }
  return null;
}

export function buildStudentRankings({
  submissions,
  users,
  rewardPointsByUser = new Map<number, number>(),
  adjustmentPointsByUser = new Map<number, number>(),
  tiers = DEFAULT_RANK_TIERS,
}: {
  submissions: RankingSubmissionInput[];
  users: RankingUserInput[];
  rewardPointsByUser?: Map<number, number>;
  adjustmentPointsByUser?: Map<number, number>;
  tiers?: readonly RankTier[];
}) {
  const acceptedProblemIdsByUser = new Map<number, Set<number>>();
  const acceptedSubmissionCountByUser = new Map<number, number>();

  for (const submission of submissions) {
    if (submission.status !== "Accepted") continue;

    const acceptedProblemIds =
      acceptedProblemIdsByUser.get(submission.userId) ?? new Set<number>();
    acceptedProblemIds.add(submission.problemId);
    acceptedProblemIdsByUser.set(submission.userId, acceptedProblemIds);
    acceptedSubmissionCountByUser.set(
      submission.userId,
      (acceptedSubmissionCountByUser.get(submission.userId) ?? 0) + 1,
    );
  }

  const entries = users
    .filter((user) => user.role === "student")
    .map((user) => {
      const acCount = acceptedProblemIdsByUser.get(user.id)?.size ?? 0;
      const acceptedSubmissionCount =
        acceptedSubmissionCountByUser.get(user.id) ?? 0;
      const basePoints = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
      const rewardPoints = rewardPointsByUser.get(user.id) ?? 0;
      const points = basePoints + rewardPoints + (adjustmentPointsByUser.get(user.id) ?? 0);
      const tierTitle = getRankTierTitle(points, tiers);
      const customTitle = normalizeCustomTitle(
        user.studentProfile?.customTitle ?? null,
      );

      return {
        acCount,
        acceptedSubmissionCount,
        customTitle,
        displayTitle: customTitle ?? tierTitle,
        points,
        basePoints,
        rewardPoints,
        rank: 0,
        tierTitle,
        userId: user.id,
        username: user.username,
      };
    })
    .sort(compareStudentRankingEntries);

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export function buildStudentRankingSummary({
  submissions,
  user,
  rewardPoints = 0,
  adjustmentPoints = 0,
  tiers = DEFAULT_RANK_TIERS,
}: {
  submissions: RankingSubmissionInput[];
  user: RankingUserInput;
  rewardPoints?: number;
  adjustmentPoints?: number;
  tiers?: readonly RankTier[];
}): StudentRankingSummary | null {
  if (user.role !== "student") return null;

  const acceptedProblemIds = new Set<number>();
  let acceptedSubmissionCount = 0;

  for (const submission of submissions) {
    if (submission.status !== "Accepted") continue;
    if (submission.userId !== user.id) continue;

    acceptedProblemIds.add(submission.problemId);
    acceptedSubmissionCount += 1;
  }

  const acCount = acceptedProblemIds.size;
  const basePoints = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
  const points = basePoints + rewardPoints + adjustmentPoints;
  const tierTitle = getRankTierTitle(points, tiers);
  const customTitle = normalizeCustomTitle(user.studentProfile?.customTitle ?? null);

  return {
    acceptedSubmissionCount,
    acCount,
    customTitle,
    displayTitle: customTitle ?? tierTitle,
    points,
    basePoints,
    rewardPoints,
    tierTitle,
    userId: user.id,
    username: user.username,
  };
}

function buildStudentRankingSummaryFromCounts({
  acceptedSubmissionCount,
  acCount,
  user,
  rewardPoints,
  adjustmentPoints,
  tiers,
}: {
  acceptedSubmissionCount: number;
  acCount: number;
  user: RankingUserInput;
  rewardPoints: number;
  adjustmentPoints: number;
  tiers: readonly RankTier[];
}): StudentRankingSummary | null {
  if (user.role !== "student") return null;
  const basePoints = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
  const points = basePoints + rewardPoints + adjustmentPoints;
  const tierTitle = getRankTierTitle(points, tiers);
  const customTitle = normalizeCustomTitle(
    user.studentProfile?.customTitle ?? null,
  );
  return {
    acceptedSubmissionCount,
    acCount,
    customTitle,
    displayTitle: customTitle ?? tierTitle,
    points,
    basePoints,
    rewardPoints,
    tierTitle,
    userId: user.id,
    username: user.username,
  };
}

export async function getStudentRankingSummariesForUsers(
  users: RankingUserInput[],
  db: DbClient = prisma,
  tiers?: readonly RankTier[],
) {
  const students = users.filter((user) => user.role === "student");
  const userIds = students.map((user) => user.id);
  if (userIds.length === 0) return [];

  const [acceptedCounts, acceptedProblems, rewardSums, adjustmentSums, settings] = await Promise.all([
    db.submission.groupBy({
      by: ["userId"],
      where: { status: "Accepted", userId: { in: userIds } },
      _count: { _all: true },
    }),
    db.submission.groupBy({
      by: ["userId", "problemId"],
      where: { status: "Accepted", userId: { in: userIds } },
      _count: { _all: true },
    }),
    db.pointReward.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _sum: { amount: true } }),
    db.studentPointAdjustment.groupBy({ by: ["studentId"], where: { studentId: { in: userIds } }, _sum: { amount: true } }),
    tiers ? Promise.resolve({ tiers }) : db === prisma ? getLadderSettingsForRender() : getLadderSettings(db),
  ]);
  const rewardPointsByUser = new Map(rewardSums.map((row) => [row.userId, row._sum.amount ?? 0]));
  const adjustmentPointsByUser = new Map(adjustmentSums.map((row) => [row.studentId, row._sum.amount ?? 0]));
  const acceptedCountByUser = new Map(
    acceptedCounts.map((row) => [row.userId, row._count._all]),
  );
  const uniqueAcceptedByUser = new Map<number, number>();
  for (const row of acceptedProblems) {
    uniqueAcceptedByUser.set(
      row.userId,
      (uniqueAcceptedByUser.get(row.userId) ?? 0) + 1,
    );
  }

  return students.flatMap((user) => {
    const summary = buildStudentRankingSummaryFromCounts({
      acceptedSubmissionCount: acceptedCountByUser.get(user.id) ?? 0,
      acCount: uniqueAcceptedByUser.get(user.id) ?? 0,
      rewardPoints: rewardPointsByUser.get(user.id) ?? 0,
      adjustmentPoints: adjustmentPointsByUser.get(user.id) ?? 0,
      tiers: settings.tiers,
      user,
    });
    return summary ? [summary] : [];
  });
}

export async function getStudentRankings(db: DbClient = prisma, tiers?: readonly RankTier[]) {
  const users = await db.user.findMany({
    where: { role: "student" },
    select: {
      id: true,
      username: true,
      role: true,
      studentProfile: { select: { customTitle: true } },
    },
  });
  const summaries = await getStudentRankingSummariesForUsers(users, db, tiers);
  return assignStudentRanks(summaries);
}

export async function getStudentRankingSummaryForUser(
  userId: number,
  db: DbClient = prisma,
  tiers?: readonly RankTier[],
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      studentProfile: { select: { customTitle: true } },
    },
  });
  if (!user) return null;

  const summaries = await getStudentRankingSummariesForUsers([user], db, tiers);
  return summaries[0] ?? null;
}

export function findRankingByUserId(
  rankings: StudentRankingEntry[],
  userId: number,
) {
  return rankings.find((entry) => entry.userId === userId) ?? null;
}
