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

export type LearningAssignmentProblemItem =
  | { assignmentProblemId: number }
  | { problemId: number };

export type LearningAssignmentProblemItemsValidation =
  | { data: LearningAssignmentProblemItem[]; error: null }
  | { data: null; error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

export function validateLearningAssignmentProblemItems(
  value: unknown,
): LearningAssignmentProblemItemsValidation {
  if (!Array.isArray(value)) {
    return { data: null, error: "任务题目格式不合法" };
  }
  if (value.length < 1 || value.length > 10) {
    return { data: null, error: "每份专项练习必须包含 1 至 10 道题" };
  }

  const items: LearningAssignmentProblemItem[] = [];
  const assignmentProblemIds = new Set<number>();
  const problemIds = new Set<number>();

  for (const rawItem of value) {
    const item =
      typeof rawItem === "object" && rawItem
        ? (rawItem as Record<string, unknown>)
        : {};
    const hasAssignmentProblemId = Object.hasOwn(
      item,
      "assignmentProblemId",
    );
    const hasProblemId = Object.hasOwn(item, "problemId");
    if (hasAssignmentProblemId === hasProblemId) {
      return {
        data: null,
        error: "每道任务题必须且只能指定现有任务题或新增题目",
      };
    }

    if (hasAssignmentProblemId) {
      const assignmentProblemId = positiveInteger(item.assignmentProblemId);
      if (assignmentProblemId === null) {
        return { data: null, error: "任务题目 ID 不合法" };
      }
      if (assignmentProblemIds.has(assignmentProblemId)) {
        return { data: null, error: "同一道现有任务题不能重复添加" };
      }
      assignmentProblemIds.add(assignmentProblemId);
      items.push({ assignmentProblemId });
      continue;
    }

    const problemId = positiveInteger(item.problemId);
    if (problemId === null) {
      return { data: null, error: "新增题目 ID 不合法" };
    }
    if (problemIds.has(problemId)) {
      return { data: null, error: "同一道新增题目不能重复添加" };
    }
    problemIds.add(problemId);
    items.push({ problemId });
  }

  return { data: items, error: null };
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
      where: { archivedAt: null, id: { in: draft.problemIds } },
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

export async function replaceLearningAssignmentProblems({
  assignmentId,
  items,
  studentId,
  db,
}: {
  assignmentId: number;
  items: LearningAssignmentProblemItem[];
  studentId: number;
  db: Prisma.TransactionClient;
}) {
  const currentRows = await db.learningAssignmentProblem.findMany({
    where: { assignmentId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  const currentById = new Map(currentRows.map((item) => [item.id, item]));
  const currentProblemIds = new Set(
    currentRows.flatMap((item) =>
      item.problemId === null ? [] : [item.problemId],
    ),
  );
  const keptIds = items.flatMap((item) =>
    "assignmentProblemId" in item ? [item.assignmentProblemId] : [],
  );
  const newProblemIds = items.flatMap((item) =>
    "problemId" in item ? [item.problemId] : [],
  );

  if (keptIds.some((id) => !currentById.has(id))) {
    throw new Error("部分现有任务题不存在，请刷新后重试");
  }
  if (newProblemIds.some((id) => currentProblemIds.has(id))) {
    throw new Error("已有任务题必须保留原记录，不能作为新题重复添加");
  }

  const keptProblemIds = new Set(
    keptIds.flatMap((id) => {
      const problemId = currentById.get(id)?.problemId ?? null;
      return problemId === null ? [] : [problemId];
    }),
  );
  if (newProblemIds.some((id) => keptProblemIds.has(id))) {
    throw new Error("同一份专项练习不能重复添加同一道题");
  }

  const [newProblems, conflicts] = await Promise.all([
    newProblemIds.length
      ? db.problem.findMany({
          where: {
            archivedAt: null,
            id: { in: newProblemIds },
          },
          select: {
            category: true,
            difficulty: true,
            id: true,
            problemType: true,
            title: true,
          },
        })
      : [],
    newProblemIds.length
      ? db.learningAssignmentProblem.findMany({
          where: {
            completedAt: null,
            problemId: { in: newProblemIds },
            assignment: {
              id: { not: assignmentId },
              status: "active",
              studentId,
            },
          },
          select: { problemId: true, problemTitle: true },
        })
      : [],
  ]);

  if (newProblems.length !== newProblemIds.length) {
    throw new Error("部分新增题目不存在或已下架，请重新选择");
  }
  if (newProblems.some((problem) => problem.problemType !== "programming")) {
    throw new Error("专项练习只能包含编程题");
  }
  if (conflicts.length > 0) {
    throw new Error(
      `以下题目已在该学生的其他未完成任务中：${conflicts
        .map((problem) => problem.problemTitle)
        .join("、")}`,
    );
  }

  const keptIdSet = new Set(keptIds);
  const removedRows = currentRows.filter((row) => !keptIdSet.has(row.id));
  const removedIds = removedRows.map((row) => row.id);
  const removedProblemIds = removedRows.flatMap((row) =>
    row.problemId === null ? [] : [row.problemId],
  );
  let unlinkedSubmissionCount = 0;

  if (removedProblemIds.length > 0) {
    const unlinked = await db.submission.updateMany({
      where: {
        learningAssignmentId: assignmentId,
        problemId: { in: removedProblemIds },
      },
      data: { learningAssignmentId: null },
    });
    unlinkedSubmissionCount = unlinked.count;
  }
  if (removedIds.length > 0) {
    await db.learningAssignmentProblem.deleteMany({
      where: { assignmentId, id: { in: removedIds } },
    });
  }

  const newProblemById = new Map(
    newProblems.map((problem) => [problem.id, problem]),
  );
  for (const [order, item] of items.entries()) {
    if ("assignmentProblemId" in item) {
      await db.learningAssignmentProblem.update({
        where: { id: item.assignmentProblemId },
        data: { order },
      });
      continue;
    }

    const problem = newProblemById.get(item.problemId)!;
    await db.learningAssignmentProblem.create({
      data: {
        assignmentId,
        order,
        problemCategory: problem.category.trim() || "未分类",
        problemDifficulty: problem.difficulty,
        problemId: problem.id,
        problemTitle: problem.title,
      },
    });
  }

  return {
    addedProblemCount: newProblemIds.length,
    removedProblemCount: removedRows.length,
    unlinkedSubmissionCount,
  };
}
