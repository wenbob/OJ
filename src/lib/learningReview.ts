import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type LearningReviewStatus = "pending" | "conquered";

export type LearningReviewProblemInput = {
  category: string;
  difficulty: string;
  id: number;
  problemType: string;
  title: string;
};

export type LearningReviewSubmissionInput = {
  createdAt: Date;
  id: number;
  problemId: number;
  status: string;
  submissionType: string;
};

export type LearningReviewEntry = {
  attemptCount: number;
  category: string;
  difficulty: string;
  failedAttemptCount: number;
  firstAcceptedAt: Date | null;
  latestStatus: string;
  latestSubmissionId: number;
  latestSubmissionType: string;
  latestSubmittedAt: Date;
  problemId: number;
  problemType: string;
  resumeSubmissionId: number | null;
  status: LearningReviewStatus;
  title: string;
};

export type WeakCategorySummary = {
  acceptedProblemCount: number;
  attemptedProblemCount: number;
  category: string;
  failedAttemptCount: number;
  masteryPercent: number;
  mistakeProblemCount: number;
  pendingProblemCount: number;
};

export type StudentLearningReview = {
  entries: LearningReviewEntry[];
  summary: {
    acceptedProblemCount: number;
    attemptedProblemCount: number;
    conqueredProblemCount: number;
    mistakeProblemCount: number;
    pendingProblemCount: number;
    totalFailedAttemptCount: number;
    weakCategoryCount: number;
  };
  weakCategories: WeakCategorySummary[];
};

function compareSubmissions(
  left: LearningReviewSubmissionInput,
  right: LearningReviewSubmissionInput,
) {
  const timeOrder = left.createdAt.getTime() - right.createdAt.getTime();
  return timeOrder || left.id - right.id;
}

export function buildStudentLearningReview({
  problems,
  submissions,
}: {
  problems: LearningReviewProblemInput[];
  submissions: LearningReviewSubmissionInput[];
}): StudentLearningReview {
  const problemsById = new Map(problems.map((problem) => [problem.id, problem]));
  const submissionsByProblemId = new Map<number, LearningReviewSubmissionInput[]>();

  for (const submission of submissions) {
    if (!problemsById.has(submission.problemId)) continue;
    const problemSubmissions = submissionsByProblemId.get(submission.problemId) ?? [];
    problemSubmissions.push(submission);
    submissionsByProblemId.set(submission.problemId, problemSubmissions);
  }

  const categoryStats = new Map<
    string,
    Omit<WeakCategorySummary, "masteryPercent">
  >();
  const entries: LearningReviewEntry[] = [];
  let acceptedProblemCount = 0;
  let totalFailedAttemptCount = 0;

  for (const [problemId, unsortedSubmissions] of submissionsByProblemId) {
    const problem = problemsById.get(problemId);
    if (!problem || unsortedSubmissions.length === 0) continue;

    const problemSubmissions = [...unsortedSubmissions].sort(compareSubmissions);
    const failedSubmissions = problemSubmissions.filter(
      (submission) => submission.status !== "Accepted",
    );
    const acceptedSubmissions = problemSubmissions.filter(
      (submission) => submission.status === "Accepted",
    );
    const accepted = acceptedSubmissions.length > 0;
    const category = problem.category.trim() || "未分类";
    const categorySummary = categoryStats.get(category) ?? {
      acceptedProblemCount: 0,
      attemptedProblemCount: 0,
      category,
      failedAttemptCount: 0,
      mistakeProblemCount: 0,
      pendingProblemCount: 0,
    };

    categorySummary.attemptedProblemCount += 1;
    categorySummary.failedAttemptCount += failedSubmissions.length;
    if (accepted) {
      acceptedProblemCount += 1;
      categorySummary.acceptedProblemCount += 1;
    } else {
      categorySummary.pendingProblemCount += 1;
    }
    if (failedSubmissions.length > 0) {
      categorySummary.mistakeProblemCount += 1;
    }
    categoryStats.set(category, categorySummary);
    totalFailedAttemptCount += failedSubmissions.length;

    // A first-try Accepted problem is mastered, not a mistake-book entry.
    if (failedSubmissions.length === 0) continue;

    const latestSubmission = problemSubmissions.at(-1)!;
    const resumeSubmission = problemSubmissions
      .filter((submission) => submission.submissionType === "practice")
      .at(-1);

    entries.push({
      attemptCount: problemSubmissions.length,
      category,
      difficulty: problem.difficulty,
      failedAttemptCount: failedSubmissions.length,
      firstAcceptedAt: acceptedSubmissions[0]?.createdAt ?? null,
      latestStatus: latestSubmission.status,
      latestSubmissionId: latestSubmission.id,
      latestSubmissionType: latestSubmission.submissionType,
      latestSubmittedAt: latestSubmission.createdAt,
      problemId,
      problemType: problem.problemType,
      resumeSubmissionId: resumeSubmission?.id ?? null,
      status: accepted ? "conquered" : "pending",
      title: problem.title,
    });
  }

  entries.sort((left, right) => {
    if (left.status !== right.status) return left.status === "pending" ? -1 : 1;
    const latestOrder = right.latestSubmittedAt.getTime() - left.latestSubmittedAt.getTime();
    if (latestOrder !== 0) return latestOrder;
    return left.problemId - right.problemId;
  });

  const weakCategories = Array.from(categoryStats.values())
    .filter((category) => category.mistakeProblemCount > 0)
    .map((category) => ({
      ...category,
      masteryPercent: Math.round(
        (category.acceptedProblemCount / category.attemptedProblemCount) * 100,
      ),
    }))
    .sort((left, right) => {
      if (right.pendingProblemCount !== left.pendingProblemCount) {
        return right.pendingProblemCount - left.pendingProblemCount;
      }
      if (left.masteryPercent !== right.masteryPercent) {
        return left.masteryPercent - right.masteryPercent;
      }
      if (right.failedAttemptCount !== left.failedAttemptCount) {
        return right.failedAttemptCount - left.failedAttemptCount;
      }
      return left.category.localeCompare(right.category, "zh-Hans-CN");
    });

  const pendingProblemCount = entries.filter((entry) => entry.status === "pending").length;
  const conqueredProblemCount = entries.length - pendingProblemCount;

  return {
    entries,
    summary: {
      acceptedProblemCount,
      attemptedProblemCount: submissionsByProblemId.size,
      conqueredProblemCount,
      mistakeProblemCount: entries.length,
      pendingProblemCount,
      totalFailedAttemptCount,
      weakCategoryCount: weakCategories.length,
    },
    weakCategories,
  };
}

export async function getStudentLearningReview(
  userId: number,
  db: DbClient = prisma,
) {
  const submissions = await db.submission.findMany({
    where: { userId, problem: { archivedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      createdAt: true,
      id: true,
      problemId: true,
      status: true,
      submissionType: true,
      problem: {
        select: {
          category: true,
          difficulty: true,
          id: true,
          problemType: true,
          title: true,
        },
      },
    },
  });

  const problemsById = new Map<number, LearningReviewProblemInput>();
  for (const submission of submissions) {
    problemsById.set(submission.problem.id, submission.problem);
  }

  return buildStudentLearningReview({
    problems: Array.from(problemsById.values()),
    submissions: submissions.map((submission) => ({
      createdAt: submission.createdAt,
      id: submission.id,
      problemId: submission.problemId,
      status: submission.status,
      submissionType: submission.submissionType,
    })),
  });
}
