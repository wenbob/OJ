import type { Prisma } from "@prisma/client";
import {
  getObjectiveSubmissionScore,
  getObjectiveTotalScore,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type ExamProblemScore = {
  problemId: number;
  title: string;
  score: number;
  maxScore: number;
  bestStatus: string;
  submissionCount: number;
  reviewSubmissionId: number | null;
};

export type ExamScoreResult = {
  totalScore: number;
  problemResults: ExamProblemScore[];
};

export function getExamEndAt(startedAt: Date, durationMin: number | null) {
  if (!durationMin) return null;
  return new Date(startedAt.getTime() + durationMin * 60 * 1000);
}

export function isExamExpired({
  durationMin,
  now = new Date(),
  startedAt,
}: {
  durationMin: number | null;
  now?: Date;
  startedAt: Date;
}) {
  const endAt = getExamEndAt(startedAt, durationMin);
  return endAt ? now.getTime() >= endAt.getTime() : false;
}

export function isExamSubmissionOnTime({
  createdAt,
  durationMin,
  startedAt,
}: {
  createdAt: Date;
  durationMin: number | null;
  startedAt: Date;
}) {
  const endAt = getExamEndAt(startedAt, durationMin);
  return !endAt || createdAt.getTime() < endAt.getTime();
}

export function selectBestObjectiveSubmission({
  items,
  submissions,
}: {
  items: ReturnType<typeof parseObjectiveItems>;
  submissions: Array<{
    id: number;
    createdAt: Date;
    caseResults: Array<{ caseIndex: number; status: string }>;
  }>;
}) {
  return submissions.reduce<{
    createdAt: Date;
    score: number;
    submissionId: number;
  } | null>((best, submission) => {
    const score = getObjectiveSubmissionScore({
      caseResults: submission.caseResults,
      items,
    });
    if (!best) {
      return {
        createdAt: submission.createdAt,
        score,
        submissionId: submission.id,
      };
    }

    const newer =
      submission.createdAt.getTime() > best.createdAt.getTime() ||
      (submission.createdAt.getTime() === best.createdAt.getTime() &&
        submission.id > best.submissionId);
    if (score > best.score || (score === best.score && newer)) {
      return {
        createdAt: submission.createdAt,
        score,
        submissionId: submission.id,
      };
    }

    return best;
  }, null);
}

export async function calculateExamScore({
  db = prisma,
  examId,
  submittedBefore,
  userId,
}: {
  db?: DbClient;
  examId: number;
  submittedBefore?: Date | null;
  userId: number;
}): Promise<ExamScoreResult> {
  const examProblems = await db.examProblem.findMany({
    where: { examId },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          problemType: true,
          objectiveItems: true,
        },
      },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });

  const problemIds = examProblems.map((item) => item.problemId);
  const submissions = problemIds.length
    ? await db.submission.findMany({
        where: {
          examId,
          problemId: { in: problemIds },
          submissionType: "exam",
          userId,
          ...(submittedBefore ? { createdAt: { lt: submittedBefore } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          id: true,
          problemId: true,
          status: true,
          caseResults: {
            select: {
              caseIndex: true,
              status: true,
            },
          },
        },
      })
    : [];

  const submissionsByProblem = new Map<number, typeof submissions>();
  for (const submission of submissions) {
    const current = submissionsByProblem.get(submission.problemId) ?? [];
    current.push(submission);
    submissionsByProblem.set(submission.problemId, current);
  }

  const problemResults = examProblems.map((examProblem) => {
    const problemSubmissions =
      submissionsByProblem.get(examProblem.problemId) ?? [];
    const isObjective = examProblem.problem.problemType === "objective";
    const objectiveItems = isObjective
      ? parseObjectiveItems(examProblem.problem.objectiveItems)
      : [];
    const maxScore = isObjective
      ? getObjectiveTotalScore(objectiveItems)
      : examProblem.score;
    const bestObjectiveSubmission = isObjective
      ? selectBestObjectiveSubmission({
          items: objectiveItems,
          submissions: problemSubmissions,
        })
      : null;
    const score = isObjective
      ? bestObjectiveSubmission?.score ?? 0
      : problemSubmissions.some((submission) => submission.status === "Accepted")
        ? examProblem.score
        : 0;
    const accepted =
      problemSubmissions.some((submission) => submission.status === "Accepted") ||
      (isObjective && maxScore > 0 && score === maxScore);

    return {
      problemId: examProblem.problemId,
      title: examProblem.problem.title,
      score,
      maxScore,
      bestStatus: accepted
        ? "Accepted"
        : problemSubmissions[0]?.status ?? "未提交",
      submissionCount: problemSubmissions.length,
      reviewSubmissionId: bestObjectiveSubmission?.submissionId ?? null,
    };
  });

  return {
    totalScore: problemResults.reduce((sum, item) => sum + item.score, 0),
    problemResults,
  };
}

export async function finishExamRecord({
  examId,
  status,
  userId,
}: {
  examId: number;
  status: "submitted" | "expired";
  userId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.examRecord.findUnique({
      where: {
        examId_userId: {
          examId,
          userId,
        },
      },
    });

    if (!record) {
      throw new Error("考试记录不存在");
    }

    if (record.status !== "in_progress") return record;

    const exam = await tx.exam.findUnique({
      where: { id: examId },
      select: { durationMin: true },
    });

    const score = await calculateExamScore({
      db: tx,
      examId,
      submittedBefore: getExamEndAt(record.startedAt, exam?.durationMin ?? null),
      userId,
    });
    return tx.examRecord.update({
      where: { id: record.id },
      data: {
        status,
        submittedAt: new Date(),
        totalScore: score.totalScore,
      },
    });
  });
}

export async function refreshFinishedExamScore({
  db = prisma,
  examId,
  userId,
}: {
  db?: typeof prisma;
  examId: number;
  userId: number;
}) {
  return db.$transaction(async (tx) => {
    const record = await tx.examRecord.findUnique({
      where: {
        examId_userId: {
          examId,
          userId,
        },
      },
      include: {
        exam: { select: { durationMin: true } },
      },
    });

    if (!record || record.status === "in_progress") return record;

    const score = await calculateExamScore({
      db: tx,
      examId,
      submittedBefore: getExamEndAt(record.startedAt, record.exam.durationMin),
      userId,
    });
    return tx.examRecord.update({
      where: { id: record.id },
      data: { totalScore: score.totalScore },
    });
  });
}

export async function expireExamRecordIfNeeded({
  examId,
  userId,
}: {
  examId: number;
  userId: number;
}) {
  const record = await prisma.examRecord.findUnique({
    where: {
      examId_userId: {
        examId,
        userId,
      },
    },
    include: {
      exam: {
        select: {
          durationMin: true,
          status: true,
        },
      },
    },
  });

  if (!record || record.status !== "in_progress") {
    return record;
  }

  const expiredByTime = isExamExpired({
    durationMin: record.exam.durationMin,
    startedAt: record.startedAt,
  });
  const expiredByExamStatus = record.exam.status !== "published";

  if (!expiredByTime && !expiredByExamStatus) {
    return record;
  }

  return finishExamRecord({ examId, status: "expired", userId });
}
