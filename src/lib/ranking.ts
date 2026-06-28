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
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      if (right.acCount !== left.acCount) return right.acCount - left.acCount;
      if (right.acceptedSubmissionCount !== left.acceptedSubmissionCount) {
        return right.acceptedSubmissionCount - left.acceptedSubmissionCount;
      }
      const usernameOrder = left.username.localeCompare(right.username, "zh-Hans-CN");
      if (usernameOrder !== 0) return usernameOrder;
      return left.userId - right.userId;
    });

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export async function getStudentRankings(db: DbClient = prisma) {
  const [users, submissions] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        studentProfile: { select: { customTitle: true } },
      },
    }),
    db.submission.findMany({
      where: { status: "Accepted" },
      select: {
        problemId: true,
        status: true,
        userId: true,
      },
    }),
  ]);

  return buildStudentRankings({ submissions, users });
}

export function findRankingByUserId(
  rankings: StudentRankingEntry[],
  userId: number,
) {
  return rankings.find((entry) => entry.userId === userId) ?? null;
}
