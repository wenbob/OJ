import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  getObjectiveTotalScore,
  isProblemType,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readExamPayload(body: unknown) {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  const durationMin =
    record.durationMin === undefined ||
    record.durationMin === null ||
    record.durationMin === ""
      ? null
      : Number(record.durationMin);
  const status = typeof record.status === "string" ? record.status : "draft";
  const examType =
    typeof record.examType === "string" ? record.examType : "programming";
  const aiEnabled = record.aiEnabled === true || record.aiEnabled === "true";

  return { title, description, durationMin, status, examType, aiEnabled };
}

function validateExamPayload(payload: ReturnType<typeof readExamPayload>) {
  if (!payload.title) return "考试名称不能为空";
  if (
    payload.durationMin !== null &&
    (!Number.isInteger(payload.durationMin) || payload.durationMin <= 0)
  ) {
    return "考试时长必须是正整数";
  }
  if (!["draft", "published", "ended"].includes(payload.status)) {
    return "考试状态不合法";
  }
  if (!isProblemType(payload.examType)) return "考试类型不合法";
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      problems: {
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
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!exam) return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  return NextResponse.json({ exam });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const payload = readExamPayload(body);
  const error = validateExamPayload(payload);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const examProblems = await prisma.examProblem.findMany({
    where: { examId },
    include: {
      problem: {
        select: {
          title: true,
          problemType: true,
          objectiveItems: true,
        },
      },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  const mismatchedProblem = examProblems.find(
    (item) => item.problem.problemType !== payload.examType,
  );
  if (mismatchedProblem) {
    return NextResponse.json(
      {
        error: `题目《${mismatchedProblem.problem.title}》与当前考试类型不一致，请先移除该题`,
      },
      { status: 400 },
    );
  }

  if (payload.status === "published") {
    if (examProblems.length === 0) {
      return NextResponse.json(
        { error: "考试至少需要添加 1 道题后才能发布" },
        { status: 400 },
      );
    }
    const invalidProblem = examProblems.find((item) => item.score <= 0);
    if (invalidProblem) {
      return NextResponse.json(
        { error: `题目《${invalidProblem.problem.title}》的分值必须大于 0` },
        { status: 400 },
      );
    }
    if (payload.examType === "objective") {
      const invalidObjectiveProblem = examProblems.find((item) => {
        const objectiveItems = parseObjectiveItems(
          item.problem.objectiveItems,
        );
        return (
          validateObjectiveItems(objectiveItems).length > 0 ||
          item.score !== getObjectiveTotalScore(objectiveItems)
        );
      });
      if (invalidObjectiveProblem) {
        return NextResponse.json(
          {
            error: `客观题《${invalidObjectiveProblem.problem.title}》的小题分值配置无效`,
          },
          { status: 400 },
        );
      }
    }
  }

  const exam = await prisma.exam.update({
    where: { id: examId },
    data: {
      title: payload.title,
      description: payload.description || null,
      durationMin: payload.durationMin,
      status: payload.status,
      examType: payload.examType,
      aiEnabled: payload.aiEnabled,
    },
  });

  return NextResponse.json({ exam });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  await prisma.exam.delete({ where: { id: examId } });
  return NextResponse.json({ ok: true });
}
