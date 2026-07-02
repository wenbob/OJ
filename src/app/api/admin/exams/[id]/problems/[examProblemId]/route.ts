import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
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
  const auth = await requireApiUser(request, "admin");
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

  const existing = await prisma.examProblem.findFirst({
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
    return NextResponse.json({ error: "考试题目不存在" }, { status: 404 });
  }
  const objectiveScore =
    existing.problem.problemType === "objective"
      ? getObjectiveTotalScore(
          parseObjectiveItems(existing.problem.objectiveItems),
        )
      : null;

  const updated = await prisma.examProblem.updateMany({
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
    return NextResponse.json({ error: "考试题目不存在" }, { status: 404 });
  }

  const examProblem = await prisma.examProblem.findFirst({
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

  return NextResponse.json({ examProblem });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id, examProblemId: examProblemIdValue } = await context.params;
  const examId = Number(id);
  const examProblemId = Number(examProblemIdValue);
  if (!Number.isInteger(examId) || !Number.isInteger(examProblemId)) {
    return NextResponse.json({ error: "考试题目 ID 不合法" }, { status: 400 });
  }

  await prisma.examProblem.deleteMany({ where: { id: examProblemId, examId } });
  return NextResponse.json({ ok: true });
}
