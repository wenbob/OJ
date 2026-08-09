import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  buildLearningAnalytics,
  buildLearningRecommendations,
  getLearningWindowStartedAt,
  type LearningProblemInput,
  type LearningSubmissionInput,
  type LearningWindow,
} from "./learningAnalytics";
import { getAssignmentProgress } from "./learningAssignments";
import { sortStudentsByDirectory } from "./studentDirectory";

const programmingProblemSelect = {
  archivedAt: true,
  category: true,
  difficulty: true,
  id: true,
  problemType: true,
  title: true,
} as const;

type LearningSubmissionRow = LearningSubmissionInput & { userId: number };
type RawLearningSubmissionRow = {
  createdAt: Date | string;
  id: bigint | number;
  problemId: bigint | number;
  status: string;
  submissionType: string;
  userId: bigint | number;
};

function normalizeRawLearningSubmission(
  row: RawLearningSubmissionRow,
): LearningSubmissionRow {
  return {
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    id: Number(row.id),
    problemId: Number(row.problemId),
    status: row.status,
    submissionType: row.submissionType,
    userId: Number(row.userId),
  };
}

async function findHistoricalLearningBaselines({
  studentId,
  windowStartedAt,
}: {
  studentId?: number;
  windowStartedAt: Date;
}) {
  const studentFilter =
    studentId === undefined
      ? Prisma.sql`AND u."role" = 'student'`
      : Prisma.sql`AND s."userId" = ${studentId}`;
  const rows = await prisma.$queryRaw<RawLearningSubmissionRow[]>(Prisma.sql`
    WITH latest_before AS (
      SELECT
        s."createdAt",
        s."id",
        s."problemId",
        s."status",
        s."submissionType",
        s."userId",
        ROW_NUMBER() OVER (
          PARTITION BY s."userId", s."problemId"
          ORDER BY s."createdAt" DESC, s."id" DESC
        ) AS row_rank
      FROM "Submission" s
      INNER JOIN "Problem" p ON p."id" = s."problemId"
      INNER JOIN "User" u ON u."id" = s."userId"
      WHERE p."problemType" = 'programming'
        AND s."createdAt" < ${windowStartedAt}
        ${studentFilter}
    ),
    accepted_before AS (
      SELECT
        s."createdAt",
        s."id",
        s."problemId",
        s."status",
        s."submissionType",
        s."userId",
        ROW_NUMBER() OVER (
          PARTITION BY s."userId", s."problemId"
          ORDER BY s."createdAt" DESC, s."id" DESC
        ) AS row_rank
      FROM "Submission" s
      INNER JOIN "Problem" p ON p."id" = s."problemId"
      INNER JOIN "User" u ON u."id" = s."userId"
      WHERE p."problemType" = 'programming'
        AND s."status" = 'Accepted'
        AND s."createdAt" < ${windowStartedAt}
        ${studentFilter}
    )
    SELECT "createdAt", "id", "problemId", "status", "submissionType", "userId"
    FROM latest_before
    WHERE row_rank = 1
    UNION
    SELECT "createdAt", "id", "problemId", "status", "submissionType", "userId"
    FROM accepted_before
    WHERE row_rank = 1
  `);
  return rows.map(normalizeRawLearningSubmission);
}

async function findLearningSubmissions({
  now,
  studentId,
  window,
}: {
  now: Date;
  studentId?: number;
  window: LearningWindow;
}) {
  const windowStartedAt = getLearningWindowStartedAt(window, now);
  const currentRows = await prisma.submission.findMany({
    where: {
      ...(studentId === undefined
        ? { user: { role: "student" } }
        : { userId: studentId }),
      problem: { problemType: "programming" },
      ...(windowStartedAt ? { createdAt: { gte: windowStartedAt } } : {}),
    },
    select: {
      createdAt: true,
      id: true,
      problemId: true,
      status: true,
      submissionType: true,
      userId: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!windowStartedAt) return currentRows;

  const baselines = await findHistoricalLearningBaselines({
    studentId,
    windowStartedAt,
  });
  return [...baselines, ...currentRows];
}

export async function getTeacherLearningDashboard(window: LearningWindow) {
  const now = new Date();
  const [students, problems, submissions, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { role: "student" },
      select: { id: true, username: true },
      orderBy: [{ username: "asc" }, { id: "asc" }],
    }),
    prisma.problem.findMany({
      where: { problemType: "programming" },
      select: programmingProblemSelect,
      orderBy: { id: "asc" },
    }),
    findLearningSubmissions({ now, window }),
    prisma.learningAssignment.findMany({
      where: { status: "active" },
      include: { problems: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const submissionsByStudent = new Map<number, LearningSubmissionInput[]>();
  for (const { userId, ...submission } of submissions) {
    const list = submissionsByStudent.get(userId) ?? [];
    list.push(submission);
    submissionsByStudent.set(userId, list);
  }
  const assignmentsByStudent = new Map<number, typeof assignments>();
  for (const assignment of assignments) {
    const list = assignmentsByStudent.get(assignment.studentId) ?? [];
    list.push(assignment);
    assignmentsByStudent.set(assignment.studentId, list);
  }

  const rows = sortStudentsByDirectory(students).map((student) => {
    const studentAssignments = assignmentsByStudent.get(student.id) ?? [];
    const activeIncompleteAssignments = studentAssignments.filter(
      (assignment) => !getAssignmentProgress(assignment.problems).completed,
    );
    const analytics = buildLearningAnalytics({
      now,
      problems,
      submissions: submissionsByStudent.get(student.id) ?? [],
      window,
    });
    const assignmentProblemCount = activeIncompleteAssignments.reduce(
      (sum, assignment) => sum + assignment.problems.length,
      0,
    );
    const assignmentCompletedCount = activeIncompleteAssignments.reduce(
      (sum, assignment) =>
        sum + assignment.problems.filter((problem) => problem.completedAt).length,
      0,
    );
    return {
      analytics,
      assignmentCompletedCount,
      assignmentProblemCount,
      incompleteAssignmentCount: activeIncompleteAssignments.length,
      needsAttention:
        !analytics.hasLearningData ||
        analytics.issueLabels.length > 0 ||
        analytics.summary.pendingProblemCount > 0,
      student,
    };
  });

  return {
    rows,
    summary: {
      activeStudentCount: rows.filter((row) => row.analytics.summary.submissionCount > 0).length,
      incompleteAssignmentCount: rows.reduce(
        (sum, row) => sum + row.incompleteAssignmentCount,
        0,
      ),
      needsAttentionCount: rows.filter((row) => row.needsAttention).length,
      studentCount: students.length,
    },
  };
}

export async function getTeacherLearningStudentDetail(
  studentId: number,
  window: LearningWindow,
) {
  const now = new Date();
  const [student, problems, submissions, assignments, activeRows] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student" },
      select: { id: true, username: true },
    }),
    prisma.problem.findMany({
      where: { problemType: "programming" },
      select: programmingProblemSelect,
      orderBy: { id: "asc" },
    }),
    findLearningSubmissions({ now, studentId, window }),
    prisma.learningAssignment.findMany({
      where: { studentId },
      include: {
        createdBy: { select: { username: true } },
        problems: { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.learningAssignmentProblem.findMany({
      where: {
        completedAt: null,
        problemId: { not: null },
        assignment: { studentId, status: "active" },
      },
      select: { problemId: true },
    }),
  ]);
  if (!student) return null;
  const analytics = buildLearningAnalytics({
    now,
    problems,
    submissions,
    window,
  });
  const activeProblems = problems.filter((problem) => problem.archivedAt === null);
  const activeProblemIds = activeRows.flatMap(({ problemId }) =>
    problemId === null ? [] : [problemId],
  );
  const recommendations = buildLearningRecommendations({
    activeProblemIds,
    analytics,
    problems: activeProblems,
  });
  return {
    activeProblemIds,
    analytics,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      progress: getAssignmentProgress(assignment.problems),
    })),
    problems: activeProblems as LearningProblemInput[],
    recommendations,
    student,
  };
}
