import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type LearningAssignmentDraft = {
  dueAt: Date | null;
  note: string | null;
  problemIds: number[];
  studentId: number;
  title: string;
};

export type LearningAssignmentValidation =
  | { data: LearningAssignmentDraft; error: null }
  | { data: null; error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateLearningAssignmentDraft(
  value: unknown,
): LearningAssignmentValidation {
  const record = typeof value === "object" && value
    ? (value as Record<string, unknown>)
    : {};
  if (
    record.studentId !== undefined &&
    typeof record.studentId !== "number" &&
    typeof record.studentId !== "string"
  ) {
    return { data: null, error: "学生 ID 不合法" };
  }
  const studentId = Number(record.studentId);
  const title = text(record.title);
  const note = text(record.note) || null;
  if (
    record.dueAt !== undefined &&
    record.dueAt !== null &&
    typeof record.dueAt !== "string"
  ) {
    return { data: null, error: "截止日期不合法" };
  }
  const rawDueAt = text(record.dueAt);
  const dueAt = rawDueAt ? new Date(rawDueAt) : null;
  const rawProblemIds = Array.isArray(record.problemIds) ? record.problemIds : [];
  if (
    rawProblemIds.some(
      (id) => typeof id !== "number" && typeof id !== "string",
    )
  ) {
    return { data: null, error: "题目 ID 不合法" };
  }
  const problemIds = Array.isArray(record.problemIds)
    ? rawProblemIds.map(Number)
    : [];

  if (!Number.isInteger(studentId) || studentId <= 0) {
    return { data: null, error: "学生 ID 不合法" };
  }
  if (!title) return { data: null, error: "专项练习标题不能为空" };
  if (title.length > 60) return { data: null, error: "专项练习标题不能超过 60 字" };
  if (note && note.length > 300) return { data: null, error: "教师说明不能超过 300 字" };
  if (rawDueAt && (!dueAt || Number.isNaN(dueAt.getTime()))) {
    return { data: null, error: "截止日期不合法" };
  }
  if (problemIds.length < 1 || problemIds.length > 10) {
    return { data: null, error: "每份专项练习必须包含 1 至 10 道题" };
  }
  if (problemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { data: null, error: "题目 ID 不合法" };
  }
  if (new Set(problemIds).size !== problemIds.length) {
    return { data: null, error: "同一份专项练习不能重复添加同一道题" };
  }

  return {
    data: { dueAt, note, problemIds, studentId, title },
    error: null,
  };
}

export async function createLearningAssignment({
  createdById,
  draft,
  db = prisma,
}: {
  createdById: number;
  draft: LearningAssignmentDraft;
  db?: DbClient;
}) {
  const [student, problems, conflicts] = await Promise.all([
    db.user.findUnique({
      where: { id: draft.studentId },
      select: { id: true, role: true, username: true },
    }),
    db.problem.findMany({
      where: { id: { in: draft.problemIds } },
      select: {
        category: true,
        difficulty: true,
        id: true,
        problemType: true,
        title: true,
      },
    }),
    db.learningAssignmentProblem.findMany({
      where: {
        completedAt: null,
        problemId: { in: draft.problemIds },
        assignment: {
          status: "active",
          studentId: draft.studentId,
        },
      },
      select: { problemId: true, problemTitle: true },
    }),
  ]);
  if (!student || student.role !== "student") {
    throw new Error("只能向学生账号下发专项练习");
  }
  if (problems.length !== draft.problemIds.length) {
    throw new Error("部分题目不存在，请重新选择");
  }
  if (problems.some((problem) => problem.problemType !== "programming")) {
    throw new Error("专项练习只能包含编程题");
  }
  if (conflicts.length > 0) {
    throw new Error(
      `以下题目已在该学生的其他未完成任务中：${conflicts
        .map((problem) => problem.problemTitle)
        .join("、")}`,
    );
  }
  const byId = new Map(problems.map((problem) => [problem.id, problem]));
  return db.learningAssignment.create({
    data: {
      createdById,
      dueAt: draft.dueAt,
      note: draft.note,
      status: "active",
      studentId: draft.studentId,
      title: draft.title,
      problems: {
        create: draft.problemIds.map((problemId, order) => {
          const problem = byId.get(problemId)!;
          return {
            order,
            problemCategory: problem.category.trim() || "未分类",
            problemDifficulty: problem.difficulty,
            problemId,
            problemTitle: problem.title,
          };
        }),
      },
    },
    include: {
      problems: { orderBy: { order: "asc" } },
      student: { select: { id: true, username: true } },
    },
  });
}

export function getAssignmentProgress(
  problems: Array<{ completedAt: Date | null }>,
) {
  const completedCount = problems.filter((problem) => problem.completedAt).length;
  const problemCount = problems.length;
  return {
    completed: problemCount > 0 && completedCount === problemCount,
    completedCount,
    percent: problemCount === 0 ? 0 : Math.round((completedCount / problemCount) * 100),
    problemCount,
  };
}

export async function getActiveAssignmentProblemIds(
  studentId: number,
  db: DbClient = prisma,
) {
  const rows = await db.learningAssignmentProblem.findMany({
    where: {
      completedAt: null,
      problemId: { not: null },
      assignment: { status: "active", studentId },
    },
    select: { problemId: true },
  });
  return rows.flatMap(({ problemId }) => (problemId === null ? [] : [problemId]));
}
