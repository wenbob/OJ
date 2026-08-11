import { NextRequest, NextResponse } from "next/server";
import {
  getObjectiveTotalScore,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import {
  getExamAccessWhere,
  requireStaffApiUser,
} from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const rawProblemIds: unknown[] = Array.isArray(record.problemIds)
    ? record.problemIds
    : [record.problemId];
  const problemIds: number[] = Array.from(
    new Set<number>(rawProblemIds.map((value) => Number(value))),
  );
  const score =
    record.score === undefined || record.score === "" ? 100 : Number(record.score);
  const order =
    record.order === undefined || record.order === "" ? null : Number(record.order);

  if (
    !Number.isInteger(examId) ||
    problemIds.length === 0 ||
    problemIds.some((problemId) => !Number.isInteger(problemId))
  ) {
    return NextResponse.json({ error: "考试或题目 ID 不合法" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score <= 0) {
    return NextResponse.json({ error: "分值必须是正整数" }, { status: 400 });
  }
  if (order !== null && (!Number.isInteger(order) || order < 0)) {
    return NextResponse.json({ error: "排序值不合法" }, { status: 400 });
  }

  try {
    const examProblems = await prisma.$transaction(async (tx) => {
      const [exam, foundProblems, existingProblems] = await Promise.all([
        tx.exam.findFirst({
          where: getExamAccessWhere(auth.user, examId),
          select: { id: true, examType: true, status: true },
        }),
        tx.problem.findMany({
          where: { archivedAt: null, id: { in: problemIds } },
          select: {
            id: true,
            title: true,
            problemType: true,
            objectiveItems: true,
          },
        }),
        tx.examProblem.findMany({
          where: { examId, problemId: { in: problemIds } },
          select: { problemId: true },
        }),
      ]);
      if (!exam) throw new ExamProblemMutationError(404, "考试不存在");
      if (exam.status !== "draft") {
        throw new ExamProblemMutationError(409, "只有草稿考试可以增删题目");
      }
      if (foundProblems.length !== problemIds.length) {
        throw new ExamProblemMutationError(404, "存在不存在的题目");
      }
      const mismatchedProblem = foundProblems.find(
        (problem) => problem.problemType !== exam.examType,
      );
      if (mismatchedProblem) {
        throw new ExamProblemMutationError(
          400,
          `题目《${mismatchedProblem.title}》与当前考试类型不一致`,
        );
      }
      if (existingProblems.length > 0) {
        throw new ExamProblemMutationError(
          409,
          "选中的题目中有题目已经在考试中",
        );
      }
      const nextOrder =
        order ??
        ((await tx.examProblem.aggregate({
          where: { examId },
          _max: { order: true },
        }))._max.order ?? 0) + 1;
      const foundProblemMap = new Map(
        foundProblems.map((problem) => [problem.id, problem]),
      );
      return Promise.all(
        problemIds.map((problemId, index) => {
          const problem = foundProblemMap.get(problemId);
          if (!problem) {
            throw new ExamProblemMutationError(404, "题目不存在");
          }
          const objectiveItems =
            problem.problemType === "objective"
              ? parseObjectiveItems(problem.objectiveItems)
              : [];
          const objectiveErrors =
            problem.problemType === "objective"
              ? validateObjectiveItems(objectiveItems)
              : [];
          if (objectiveErrors.length > 0) {
            throw new ExamProblemMutationError(
              400,
              `题目《${problem.title}》配置无效：${objectiveErrors[0]}`,
            );
          }

          return tx.examProblem.create({
            data: {
              examId,
              problemId,
              score:
                problem.problemType === "objective"
                  ? getObjectiveTotalScore(objectiveItems)
                  : score,
              order: nextOrder + index,
            },
            include: {
              problem: {
                select: {
                  id: true,
                  title: true,
                  difficulty: true,
                  category: true,
                  problemType: true,
                },
              },
            },
          });
        }),
      );
    });

    if (Array.isArray(record.problemIds)) {
      return NextResponse.json({ examProblems }, { status: 201 });
    }

    return NextResponse.json({ examProblem: examProblems[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof ExamProblemMutationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "添加题目失败，考试状态或题单可能已经变化" },
      { status: 409 },
    );
  }
}

class ExamProblemMutationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
