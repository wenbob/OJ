import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const RANK_POINT_PER_UNIQUE_ACCEPTED = 10;
export const CUSTOM_TITLE_MAX_LENGTH = 20;

export const rankTiers = [
  { minPoints: 0, title: "青铜学徒" },
  { minPoints: 65, title: "白银新秀" },
  { minPoints: 130, title: "黄金精英" },
  { minPoints: 260, title: "铂金高手" },
  { minPoints: 455, title: "钻石强者" },
  { minPoints: 715, title: "星耀大师" },
  { minPoints: 1040, title: "最强王者" },
  { minPoints: 1560, title: "荣耀王者" },
] as const;

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

export function getRankTierTitle(points: number) {
  let current: string = rankTiers[0].title;
  for (const tier of rankTiers) {
    if (points >= tier.minPoints) {
      current = tier.title;
    } else {
      break;
    }
  }
  return current;
}

export function getRankTierProgress(points: number): RankTierProgress {
  const safePoints = Math.max(0, points);
  let currentTierIndex = 0;

  for (const [index, tier] of rankTiers.entries()) {
    if (safePoints >= tier.minPoints) {
      currentTierIndex = index;
    } else {
      break;
    }
  }

  const currentTier = rankTiers[currentTierIndex];
  const nextTier = rankTiers[currentTierIndex + 1] ?? null;

  if (!nextTier) {
    return {
      acceptedProblemsToNextTier: 0,
      currentTierMinPoints: currentTier.minPoints,
      currentTierTitle: currentTier.title,
      isMaxTier: true,
      nextTierMinPoints: null,
      nextTierTitle: null,
      pointsForCurrentTier: 0,
      pointsIntoTier: Math.max(0, safePoints - currentTier.minPoints),
      pointsToNextTier: 0,
      progressPercent: 100,
    };
  }

  const pointsForCurrentTier = nextTier.minPoints - currentTier.minPoints;
  const pointsIntoTier = Math.min(
    pointsForCurrentTier,
    Math.max(0, safePoints - currentTier.minPoints),
  );
  const pointsToNextTier = Math.max(0, nextTier.minPoints - safePoints);

  return {
    acceptedProblemsToNextTier: Math.ceil(
      pointsToNextTier / RANK_POINT_PER_UNIQUE_ACCEPTED,
    ),
    currentTierMinPoints: currentTier.minPoints,
    currentTierTitle: currentTier.title,
    isMaxTier: false,
    nextTierMinPoints: nextTier.minPoints,
    nextTierTitle: nextTier.title,
    pointsForCurrentTier,
    pointsIntoTier,
    pointsToNextTier,
    progressPercent: Math.round((pointsIntoTier / pointsForCurrentTier) * 100),
  };
}

export function buildStudentRankings({
  submissions,
  users,
}: {
  submissions: RankingSubmissionInput[];
  users: RankingUserInput[];
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
      const points = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
      const tierTitle = getRankTierTitle(points);
      const customTitle = normalizeCustomTitle(
        user.studentProfile?.customTitle ?? null,
      );

      return {
        acCount,
        acceptedSubmissionCount,
        customTitle,
        displayTitle: customTitle ?? tierTitle,
        points,
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
}: {
  submissions: RankingSubmissionInput[];
  user: RankingUserInput;
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
  const points = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
  const tierTitle = getRankTierTitle(points);
  const customTitle = normalizeCustomTitle(user.studentProfile?.customTitle ?? null);

  return {
    acceptedSubmissionCount,
    acCount,
    customTitle,
    displayTitle: customTitle ?? tierTitle,
    points,
    tierTitle,
    userId: user.id,
    username: user.username,
  };
}

function buildStudentRankingSummaryFromCounts({
  acceptedSubmissionCount,
  acCount,
  user,
}: {
  acceptedSubmissionCount: number;
  acCount: number;
  user: RankingUserInput;
}): StudentRankingSummary | null {
  if (user.role !== "student") return null;
  const points = acCount * RANK_POINT_PER_UNIQUE_ACCEPTED;
  const tierTitle = getRankTierTitle(points);
  const customTitle = normalizeCustomTitle(
    user.studentProfile?.customTitle ?? null,
  );
  return {
    acceptedSubmissionCount,
    acCount,
    customTitle,
    displayTitle: customTitle ?? tierTitle,
    points,
    tierTitle,
    userId: user.id,
    username: user.username,
  };
}

export async function getStudentRankingSummariesForUsers(
  users: RankingUserInput[],
  db: DbClient = prisma,
) {
  const students = users.filter((user) => user.role === "student");
  const userIds = students.map((user) => user.id);
  if (userIds.length === 0) return [];

  const [acceptedCounts, acceptedProblems] = await Promise.all([
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
  ]);
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
      user,
    });
    return summary ? [summary] : [];
  });
}

export async function getStudentRankings(db: DbClient = prisma) {
  const users = await db.user.findMany({
    where: { role: "student" },
    select: {
      id: true,
      username: true,
      role: true,
      studentProfile: { select: { customTitle: true } },
    },
  });
  const summaries = await getStudentRankingSummariesForUsers(users, db);
  return assignStudentRanks(summaries);
}

export async function getStudentRankingSummaryForUser(
  userId: number,
  db: DbClient = prisma,
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

  const summaries = await getStudentRankingSummariesForUsers([user], db);
  return summaries[0] ?? null;
}

export function findRankingByUserId(
  rankings: StudentRankingEntry[],
  userId: number,
) {
  return rankings.find((entry) => entry.userId === userId) ?? null;
}
