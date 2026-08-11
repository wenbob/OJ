import { NextRequest, NextResponse } from "next/server";
import {
  getObjectiveTotalScore,
  parseObjectiveItems,
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
  params: Promise<{ id: string; examProblemId: string }>;
};

function readUpdatePayload(body: unknown) {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const order = record.order === undefined || record.order === "" ? null : Number(record.order);
  const score = record.score === undefined || record.score === "" ? null : Number(record.score);
  return { order, score };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id, examProblemId: examProblemIdValue } = await context.params;
  const examId = Number(id);
  const examProblemId = Number(examProblemIdValue);
  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const payload = readUpdatePayload(body);

  if (!Number.isInteger(examId) || !Number.isInteger(examProblemId)) {
    return NextResponse.json({ error: "考试题目 ID 不合法" }, { status: 400 });
  }
  if (payload.order !== null && (!Number.isInteger(payload.order) || payload.order < 0)) {
    return NextResponse.json({ error: "排序值不合法" }, { status: 400 });
  }
  if (payload.score !== null && (!Number.isInteger(payload.score) || payload.score <= 0)) {
    return NextResponse.json({ error: "分值必须是正整数" }, { status: 400 });
  }

  try {
    const examProblem = await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({
        where: getExamAccessWhere(auth.user, examId),
        select: { id: true, status: true },
      });
      if (!exam) throw new ExamProblemEditError(404, "考试不存在");
      if (exam.status !== "draft") {
        throw new ExamProblemEditError(409, "只有草稿考试可以调整题目");
      }
      const existing = await tx.examProblem.findFirst({
        where: { id: examProblemId, examId },
        include: {
          problem: {
            select: {
              problemType: true,
              objectiveItems: true,
            },
          },
        },
      });
      if (!existing) {
        throw new ExamProblemEditError(404, "考试题目不存在");
      }
      const objectiveScore =
        existing.problem.problemType === "objective"
          ? getObjectiveTotalScore(
              parseObjectiveItems(existing.problem.objectiveItems),
            )
          : null;
      const updated = await tx.examProblem.updateMany({
        where: { id: examProblemId, examId },
        data: {
          ...(payload.order !== null ? { order: payload.order } : {}),
          ...(objectiveScore !== null
            ? { score: objectiveScore }
            : payload.score !== null
              ? { score: payload.score }
              : {}),
        },
      });
      if (updated.count === 0) {
        throw new ExamProblemEditError(404, "考试题目不存在");
      }
      return tx.examProblem.findFirst({
        where: { id: examProblemId, examId },
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
    });
    return NextResponse.json({ examProblem });
  } catch (error) {
    if (error instanceof ExamProblemEditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "调整考试题目失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id, examProblemId: examProblemIdValue } = await context.params;
  const examId = Number(id);
  const examProblemId = Number(examProblemIdValue);
  if (!Number.isInteger(examId) || !Number.isInteger(examProblemId)) {
    return NextResponse.json({ error: "考试题目 ID 不合法" }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({
        where: getExamAccessWhere(auth.user, examId),
        select: { id: true, status: true },
      });
      if (!exam) throw new ExamProblemEditError(404, "考试不存在");
      if (exam.status !== "draft") {
        throw new ExamProblemEditError(409, "只有草稿考试可以增删题目");
      }
      const deleted = await tx.examProblem.deleteMany({
        where: { id: examProblemId, examId },
      });
      if (deleted.count === 0) {
        throw new ExamProblemEditError(404, "考试题目不存在");
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ExamProblemEditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "移除考试题目失败" }, { status: 500 });
  }
}

class ExamProblemEditError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
