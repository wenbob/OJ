import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  buildLearningAnalytics,
  buildLearningAnalyticsFromFacts,
  buildLearningRecommendations,
  getLearningWindowStartedAt,
  type LearningProblemInput,
  type LearningAnalyticsFactsInput,
  type LearningProblemFactInput,
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

type RawAllLearningFactRow = {
  acceptedEver: bigint | number;
  failedAfterLastAccepted: bigint | number;
  latestStatus: string;
  latestSubmissionAt: Date | string;
  latestSubmissionId: bigint | number;
  problemId: bigint | number;
  userId: bigint | number;
  windowFailedCount: bigint | number;
};

type RawAllLearningStatusRow = {
  count: bigint | number;
  status: string;
  userId: bigint | number;
};

function emptyLearningFacts(): LearningAnalyticsFactsInput {
  return {
    hasLearningData: false,
    lastTrainingAt: null,
    problemFacts: [],
    statusCounts: {},
    submissionCount: 0,
    uniqueAcceptedInWindow: 0,
  };
}

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

async function findAllLearningFacts(studentId?: number) {
  const studentFilter =
    studentId === undefined
      ? Prisma.sql`AND u."role" = 'student'`
      : Prisma.sql`AND s."userId" = ${studentId}`;
  const [factRows, statusRows] = await Promise.all([
    prisma.$queryRaw<RawAllLearningFactRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT s."createdAt", s."id", s."problemId", s."status", s."userId"
        FROM "Submission" s
        INNER JOIN "Problem" p ON p."id" = s."problemId"
        INNER JOIN "User" u ON u."id" = s."userId"
        WHERE p."problemType" = 'programming'
          ${studentFilter}
      ),
      latest AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "userId", "problemId"
          ORDER BY "createdAt" DESC, "id" DESC
        ) AS row_rank
        FROM filtered
      ),
      accepted AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "userId", "problemId"
          ORDER BY "createdAt" DESC, "id" DESC
        ) AS row_rank
        FROM filtered
        WHERE "status" = 'Accepted'
      )
      SELECT
        f."userId" AS "userId",
        f."problemId" AS "problemId",
        MAX(CASE WHEN f."status" = 'Accepted' THEN 1 ELSE 0 END) AS "acceptedEver",
        SUM(CASE WHEN f."status" <> 'Accepted' THEN 1 ELSE 0 END) AS "windowFailedCount",
        SUM(CASE
          WHEN f."status" <> 'Accepted' AND (
            a."id" IS NULL OR
            f."createdAt" > a."createdAt" OR
            (f."createdAt" = a."createdAt" AND f."id" > a."id")
          ) THEN 1 ELSE 0
        END) AS "failedAfterLastAccepted",
        l."status" AS "latestStatus",
        l."createdAt" AS "latestSubmissionAt",
        l."id" AS "latestSubmissionId"
      FROM filtered f
      INNER JOIN latest l
        ON l."userId" = f."userId"
        AND l."problemId" = f."problemId"
        AND l.row_rank = 1
      LEFT JOIN accepted a
        ON a."userId" = f."userId"
        AND a."problemId" = f."problemId"
        AND a.row_rank = 1
      GROUP BY f."userId", f."problemId"
    `),
    prisma.$queryRaw<RawAllLearningStatusRow[]>(Prisma.sql`
      SELECT s."userId" AS "userId", s."status" AS "status", COUNT(*) AS "count"
      FROM "Submission" s
      INNER JOIN "Problem" p ON p."id" = s."problemId"
      INNER JOIN "User" u ON u."id" = s."userId"
      WHERE p."problemType" = 'programming'
        ${studentFilter}
      GROUP BY s."userId", s."status"
    `),
  ]);

  const factsByStudent = new Map<number, LearningAnalyticsFactsInput>();
  for (const row of factRows) {
    const userId = Number(row.userId);
    const facts = factsByStudent.get(userId) ?? emptyLearningFacts();
    const acceptedEver = Number(row.acceptedEver) > 0;
    const latestSubmissionAt =
      row.latestSubmissionAt instanceof Date
        ? row.latestSubmissionAt
        : new Date(row.latestSubmissionAt);
    const problemFact: LearningProblemFactInput = {
      acceptedEver,
      acceptedInWindow: acceptedEver,
      failedAfterLastAccepted: Number(row.failedAfterLastAccepted),
      latestStatus: row.latestStatus,
      latestSubmissionAt,
      latestSubmissionId: Number(row.latestSubmissionId),
      problemId: Number(row.problemId),
      windowFailedCount: Number(row.windowFailedCount),
    };
    facts.problemFacts.push(problemFact);
    facts.hasLearningData = true;
    if (
      !facts.lastTrainingAt ||
      latestSubmissionAt > facts.lastTrainingAt
    ) {
      facts.lastTrainingAt = latestSubmissionAt;
    }
    if (acceptedEver) facts.uniqueAcceptedInWindow += 1;
    factsByStudent.set(userId, facts);
  }
  for (const row of statusRows) {
    const userId = Number(row.userId);
    const facts = factsByStudent.get(userId) ?? emptyLearningFacts();
    const count = Number(row.count);
    facts.statusCounts[row.status] = count;
    facts.submissionCount += count;
    facts.hasLearningData ||= count > 0;
    factsByStudent.set(userId, facts);
  }
  return factsByStudent;
}

async function loadLearningData({
  now,
  studentId,
  window,
}: {
  now: Date;
  studentId?: number;
  window: LearningWindow;
}) {
  if (window === "all") {
    return {
      factsByStudent: await findAllLearningFacts(studentId),
      kind: "facts" as const,
    };
  }
  return {
    kind: "submissions" as const,
    submissions: await findLearningSubmissions({ now, studentId, window }),
  };
}

export async function getTeacherLearningDashboard(window: LearningWindow) {
  const now = new Date();
  const [students, problems, learningData, assignments] = await Promise.all([
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
    loadLearningData({ now, window }),
    prisma.learningAssignment.findMany({
      where: {
        status: "active",
        problems: { some: { completedAt: null } },
      },
      include: { problems: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const submissionsByStudent = new Map<number, LearningSubmissionInput[]>();
  if (learningData.kind === "submissions") {
    for (const { userId, ...submission } of learningData.submissions) {
      const list = submissionsByStudent.get(userId) ?? [];
      list.push(submission);
      submissionsByStudent.set(userId, list);
    }
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
    const analytics =
      learningData.kind === "facts"
        ? buildLearningAnalyticsFromFacts({
            facts:
              learningData.factsByStudent.get(student.id) ??
              emptyLearningFacts(),
            now,
            problems,
            window,
          })
        : buildLearningAnalytics({
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
  const [student, problems, learningData, assignments, activeRows] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student" },
      select: { id: true, username: true },
    }),
    prisma.problem.findMany({
      where: { problemType: "programming" },
      select: programmingProblemSelect,
      orderBy: { id: "asc" },
    }),
    loadLearningData({ now, studentId, window }),
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
  const analytics =
    learningData.kind === "facts"
      ? buildLearningAnalyticsFromFacts({
          facts:
            learningData.factsByStudent.get(studentId) ?? emptyLearningFacts(),
          now,
          problems,
          window,
        })
      : buildLearningAnalytics({
          now,
          problems,
          submissions: learningData.submissions,
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
