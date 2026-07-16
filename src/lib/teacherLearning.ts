import { prisma } from "./prisma";
import {
  buildLearningAnalytics,
  buildLearningRecommendations,
  type LearningProblemInput,
  type LearningSubmissionInput,
  type LearningWindow,
} from "./learningAnalytics";
import { getAssignmentProgress } from "./learningAssignments";

const programmingProblemSelect = {
  archivedAt: true,
  category: true,
  difficulty: true,
  id: true,
  problemType: true,
  title: true,
} as const;

export async function getTeacherLearningDashboard(window: LearningWindow) {
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
    prisma.submission.findMany({
      where: {
        user: { role: "student" },
        problem: { problemType: "programming" },
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
    }),
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

  const shortageKeys = new Set<string>();
  const activeProblems = problems.filter((problem) => problem.archivedAt === null);
  const rows = students.map((student) => {
    const studentAssignments = assignmentsByStudent.get(student.id) ?? [];
    const activeIncompleteAssignments = studentAssignments.filter(
      (assignment) => !getAssignmentProgress(assignment.problems).completed,
    );
    const activeProblemIds = activeIncompleteAssignments.flatMap((assignment) =>
      assignment.problems.flatMap((problem) =>
        problem.completedAt || problem.problemId === null ? [] : [problem.problemId],
      ),
    );
    const analytics = buildLearningAnalytics({
      problems,
      submissions: submissionsByStudent.get(student.id) ?? [],
      window,
    });
    const recommendations = buildLearningRecommendations({
      activeProblemIds,
      analytics,
      problems: activeProblems,
    });
    for (const category of recommendations.shortageCategories) {
      shortageKeys.add(`${student.id}:${category}`);
    }
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
      shortageCount: recommendations.shortageCategories.length,
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
      shortageCount: shortageKeys.size,
      studentCount: students.length,
    },
  };
}

export async function getTeacherLearningStudentDetail(
  studentId: number,
  window: LearningWindow,
) {
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
    prisma.submission.findMany({
      where: { userId: studentId, problem: { problemType: "programming" } },
      select: {
        createdAt: true,
        id: true,
        problemId: true,
        status: true,
        submissionType: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
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
  const analytics = buildLearningAnalytics({ problems, submissions, window });
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
