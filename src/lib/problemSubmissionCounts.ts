import { prisma } from "@/lib/prisma";

export async function getPracticeSubmissionCountsByProblem({
  problemIds,
  userId,
}: {
  problemIds: number[];
  userId?: number;
}) {
  if (problemIds.length === 0) {
    return new Map<number, number>();
  }

  const rows = await prisma.submission.groupBy({
    by: ["problemId"],
    where: {
      problemId: { in: problemIds },
      submissionType: "practice",
      ...(userId ? { userId } : {}),
    },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.problemId, row._count._all]));
}

export async function getAcceptedProblemIds({
  problemIds,
  userId,
}: {
  problemIds: number[];
  userId: number;
}) {
  if (problemIds.length === 0) return new Set<number>();

  const rows = await prisma.submission.findMany({
    where: {
      problemId: { in: problemIds },
      status: "Accepted",
      userId,
    },
    select: { problemId: true },
    distinct: ["problemId"],
  });

  return new Set(rows.map((row) => row.problemId));
}

export async function getLatestAcceptedSubmissionIdsByProblem({
  problemIds,
  userId,
}: {
  problemIds: number[];
  userId: number;
}) {
  if (problemIds.length === 0) {
    return new Map<number, number>();
  }

  const rows = await prisma.submission.findMany({
    where: {
      problemId: { in: problemIds },
      status: "Accepted",
      userId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      problemId: true,
    },
  });

  const latestByProblem = new Map<number, number>();
  rows.forEach((row) => {
    if (!latestByProblem.has(row.problemId)) {
      latestByProblem.set(row.problemId, row.id);
    }
  });

  return latestByProblem;
}
