import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export const LEARNING_WINDOWS = ["7d", "30d", "all"] as const;
export type LearningWindow = (typeof LEARNING_WINDOWS)[number];

export type LearningProblemInput = {
  category: string;
  difficulty: string;
  id: number;
  problemType: string;
  title: string;
};

export type LearningSubmissionInput = {
  createdAt: Date;
  id: number;
  problemId: number;
  status: string;
  submissionType: string;
};

export type LearningCategoryInsight = {
  acceptedProblemCount: number;
  attemptedProblemCount: number;
  category: string;
  masteryPercent: number;
  pendingProblemCount: number;
  windowFailedCount: number;
};

export type LearningProblemInsight = {
  acceptedEver: boolean;
  category: string;
  difficulty: string;
  failedAfterLastAccepted: number;
  latestStatus: string;
  latestSubmissionAt: Date;
  latestSubmissionId: number;
  problemId: number;
  title: string;
  windowFailedCount: number;
};

export type LearningAnalytics = {
  categories: LearningCategoryInsight[];
  hasLearningData: boolean;
  issueLabels: string[];
  latestFailures: LearningProblemInsight[];
  pendingProblems: LearningProblemInsight[];
  problems: LearningProblemInsight[];
  statusCounts: Record<string, number>;
  stuckProblems: LearningProblemInsight[];
  summary: {
    acceptedProblemCount: number;
    attemptedProblemCount: number;
    failedSubmissionCount: number;
    lastTrainingAt: Date | null;
    pendingProblemCount: number;
    submissionCount: number;
    uniqueAcceptedInWindow: number;
  };
  window: LearningWindow;
  windowStartedAt: Date | null;
};

export type RecommendationProblem = LearningProblemInput & {
  reason: "pending" | "unattempted";
};

export type LearningRecommendations = {
  problems: RecommendationProblem[];
  shortageCategories: string[];
  targetCategories: string[];
};

function getWindowStartedAt(window: LearningWindow, now: Date) {
  if (window === "all") return null;
  const days = window === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isLearningWindow(value: unknown): value is LearningWindow {
  return typeof value === "string" && LEARNING_WINDOWS.includes(value as LearningWindow);
}

function normalizeCategory(value: string) {
  return value.trim() || "未分类";
}

function compareSubmission(
  left: LearningSubmissionInput,
  right: LearningSubmissionInput,
) {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id;
}

export function buildLearningAnalytics({
  now = new Date(),
  problems,
  submissions,
  window = "30d",
}: {
  now?: Date;
  problems: LearningProblemInput[];
  submissions: LearningSubmissionInput[];
  window?: LearningWindow;
}): LearningAnalytics {
  const programmingProblems = new Map(
    problems
      .filter((problem) => problem.problemType === "programming")
      .map((problem) => [problem.id, problem]),
  );
  const relevantSubmissions = submissions
    .filter((submission) => programmingProblems.has(submission.problemId))
    .sort(compareSubmission);
  const windowStartedAt = getWindowStartedAt(window, now);
  const windowSubmissions = relevantSubmissions.filter(
    (submission) => !windowStartedAt || submission.createdAt >= windowStartedAt,
  );
  const windowSubmissionIds = new Set(windowSubmissions.map((submission) => submission.id));
  const submissionsByProblem = new Map<number, LearningSubmissionInput[]>();

  for (const submission of relevantSubmissions) {
    const list = submissionsByProblem.get(submission.problemId) ?? [];
    list.push(submission);
    submissionsByProblem.set(submission.problemId, list);
  }

  const categoryMap = new Map<
    string,
    Omit<LearningCategoryInsight, "masteryPercent">
  >();
  const problemInsights: LearningProblemInsight[] = [];
  const acceptedInWindow = new Set<number>();

  for (const [problemId, problemSubmissions] of submissionsByProblem) {
    const problem = programmingProblems.get(problemId)!;
    const category = normalizeCategory(problem.category);
    const acceptedEver = problemSubmissions.some(({ status }) => status === "Accepted");
    let lastAcceptedIndex = -1;
    for (let index = problemSubmissions.length - 1; index >= 0; index -= 1) {
      if (problemSubmissions[index].status === "Accepted") {
        lastAcceptedIndex = index;
        break;
      }
    }
    const windowProblemSubmissions = problemSubmissions.filter((submission) =>
      windowSubmissionIds.has(submission.id),
    );
    const windowFailedCount = windowProblemSubmissions.filter(
      ({ status }) => status !== "Accepted",
    ).length;
    if (windowProblemSubmissions.some(({ status }) => status === "Accepted")) {
      acceptedInWindow.add(problemId);
    }

    const latestSubmission = problemSubmissions.at(-1)!;
    const insight: LearningProblemInsight = {
      acceptedEver,
      category,
      difficulty: problem.difficulty,
      failedAfterLastAccepted: problemSubmissions
        .slice(lastAcceptedIndex + 1)
        .filter(
          (submission) =>
            windowSubmissionIds.has(submission.id) && submission.status !== "Accepted",
        ).length,
      latestStatus: latestSubmission.status,
      latestSubmissionAt: latestSubmission.createdAt,
      latestSubmissionId: latestSubmission.id,
      problemId,
      title: problem.title,
      windowFailedCount,
    };
    problemInsights.push(insight);

    const categoryInsight = categoryMap.get(category) ?? {
      acceptedProblemCount: 0,
      attemptedProblemCount: 0,
      category,
      pendingProblemCount: 0,
      windowFailedCount: 0,
    };
    categoryInsight.attemptedProblemCount += 1;
    categoryInsight.windowFailedCount += windowFailedCount;
    if (acceptedEver) categoryInsight.acceptedProblemCount += 1;
    else categoryInsight.pendingProblemCount += 1;
    categoryMap.set(category, categoryInsight);
  }

  const statusCounts: Record<string, number> = {};
  for (const submission of windowSubmissions) {
    statusCounts[submission.status] = (statusCounts[submission.status] ?? 0) + 1;
  }
  const failedSubmissionCount = windowSubmissions.filter(
    ({ status }) => status !== "Accepted",
  ).length;
  const issueLabels: string[] = [];
  if (relevantSubmissions.length > 0 && windowSubmissions.length === 0) {
    issueLabels.push("近期未训练");
  }

  const stuckProblems = problemInsights
    .filter((problem) => problem.failedAfterLastAccepted >= 3)
    .sort(
      (left, right) =>
        right.failedAfterLastAccepted - left.failedAfterLastAccepted ||
        right.latestSubmissionAt.getTime() - left.latestSubmissionAt.getTime() ||
        left.problemId - right.problemId,
    );
  if (stuckProblems.length > 0) issueLabels.push("持续卡题");

  if (failedSubmissionCount > 0) {
    const compileCount = statusCounts["Compile Error"] ?? 0;
    const wrongAnswerCount = statusCounts["Wrong Answer"] ?? 0;
    const runtimeCount =
      (statusCounts["Runtime Error"] ?? 0) +
      (statusCounts["Time Limit Exceeded"] ?? 0);
    if (compileCount >= 2 && compileCount / failedSubmissionCount >= 0.4) {
      issueLabels.push("编译基础不稳");
    }
    if (wrongAnswerCount >= 2 && wrongAnswerCount / failedSubmissionCount >= 0.4) {
      issueLabels.push("逻辑判断需加强");
    }
    if (runtimeCount >= 2 && runtimeCount / failedSubmissionCount >= 0.25) {
      issueLabels.push("运行稳定性或效率需加强");
    }
  }

  const categories = Array.from(categoryMap.values())
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
      if (right.windowFailedCount !== left.windowFailedCount) {
        return right.windowFailedCount - left.windowFailedCount;
      }
      if (left.masteryPercent !== right.masteryPercent) {
        return left.masteryPercent - right.masteryPercent;
      }
      return left.category.localeCompare(right.category, "zh-Hans-CN");
    });
  const pendingProblems = problemInsights
    .filter((problem) => !problem.acceptedEver)
    .sort(
      (left, right) =>
        right.windowFailedCount - left.windowFailedCount ||
        right.latestSubmissionAt.getTime() - left.latestSubmissionAt.getTime() ||
        left.problemId - right.problemId,
    );
  const latestFailures = problemInsights
    .filter((problem) => problem.latestStatus !== "Accepted")
    .sort(
      (left, right) =>
        right.latestSubmissionAt.getTime() - left.latestSubmissionAt.getTime() ||
        left.problemId - right.problemId,
    );

  return {
    categories,
    hasLearningData: relevantSubmissions.length > 0,
    issueLabels,
    latestFailures,
    pendingProblems,
    problems: problemInsights,
    statusCounts,
    stuckProblems,
    summary: {
      acceptedProblemCount: problemInsights.filter((problem) => problem.acceptedEver).length,
      attemptedProblemCount: problemInsights.length,
      failedSubmissionCount,
      lastTrainingAt: relevantSubmissions.at(-1)?.createdAt ?? null,
      pendingProblemCount: pendingProblems.length,
      submissionCount: windowSubmissions.length,
      uniqueAcceptedInWindow: acceptedInWindow.size,
    },
    window,
    windowStartedAt,
  };
}

export function buildLearningRecommendations({
  activeProblemIds = [],
  analytics,
  limit = 5,
  problems,
}: {
  activeProblemIds?: number[];
  analytics: LearningAnalytics;
  limit?: number;
  problems: LearningProblemInput[];
}): LearningRecommendations {
  if (!analytics.hasLearningData) {
    return { problems: [], shortageCategories: [], targetCategories: [] };
  }
  const normalizedLimit = Math.min(10, Math.max(1, Math.trunc(limit)));
  const targetCategories = analytics.categories
    .filter((category) => category.pendingProblemCount > 0 || category.windowFailedCount > 0)
    .slice(0, 2)
    .map((category) => category.category);
  const acceptedIds = new Set(
    analytics.problems
      .filter((problem) => problem.acceptedEver)
      .map((problem) => problem.problemId),
  );
  const pendingIds = new Set(analytics.pendingProblems.map((problem) => problem.problemId));
  const attemptedIds = new Set(analytics.problems.map((problem) => problem.problemId));

  const excludedIds = new Set(activeProblemIds);
  const candidatesByCategory = new Map<string, RecommendationProblem[]>();
  for (const category of targetCategories) {
    const pending = analytics.pendingProblems
      .filter(
        (problem) =>
          problem.category === category && !excludedIds.has(problem.problemId),
      )
      .map((problem) => ({
        category: problem.category,
        difficulty: problem.difficulty,
        id: problem.problemId,
        problemType: "programming",
        reason: "pending" as const,
        title: problem.title,
      }));
    const unattempted = problems
      .filter(
        (problem) =>
          problem.problemType === "programming" &&
          normalizeCategory(problem.category) === category &&
          !attemptedIds.has(problem.id) &&
          !acceptedIds.has(problem.id) &&
          !pendingIds.has(problem.id) &&
          !excludedIds.has(problem.id),
      )
      .sort((left, right) => left.id - right.id)
      .map((problem) => ({ ...problem, category, reason: "unattempted" as const }));
    candidatesByCategory.set(category, [...pending, ...unattempted]);
  }

  const selected: RecommendationProblem[] = [];
  let madeProgress = true;
  while (selected.length < normalizedLimit && madeProgress) {
    madeProgress = false;
    for (const category of targetCategories) {
      const candidates = candidatesByCategory.get(category) ?? [];
      const candidate = candidates.shift();
      if (!candidate) continue;
      selected.push(candidate);
      madeProgress = true;
      if (selected.length >= normalizedLimit) break;
    }
  }

  return {
    problems: selected,
    shortageCategories: targetCategories.filter(
      (category) =>
        selected.every((problem) => problem.category !== category),
    ),
    targetCategories,
  };
}

export async function getStudentLearningAnalytics(
  studentId: number,
  window: LearningWindow = "30d",
  db: DbClient = prisma,
) {
  const submissions = await db.submission.findMany({
    where: {
      userId: studentId,
      problem: { problemType: "programming" },
    },
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
  const problems = Array.from(
    new Map(submissions.map((submission) => [submission.problemId, submission.problem])).values(),
  );
  return buildLearningAnalytics({
    problems,
    submissions: submissions.map((submission) => ({
      createdAt: submission.createdAt,
      id: submission.id,
      problemId: submission.problemId,
      status: submission.status,
      submissionType: submission.submissionType,
    })),
    window,
  });
}
