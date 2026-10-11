import { NextRequest, NextResponse } from "next/server";
import {
  getObjectiveTotalScore,
  isProblemType,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { snapshotExamProblems } from "@/lib/examSnapshot";
import { prisma } from "@/lib/prisma";
import { deleteUnusedDraftExam, ExamLifecycleError, settleEndedExamRecords } from "@/lib/examLifecycle";
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
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const exam = await prisma.exam.findFirst({
    where: getExamAccessWhere(auth.user, examId),
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
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }
  const accessibleExam = await prisma.exam.findFirst({
    where: getExamAccessWhere(auth.user, examId),
    select: {
      aiEnabled: true,
      archivedAt: true,
      description: true,
      durationMin: true,
      examType: true,
      id: true,
      status: true,
      title: true,
    },
  });
  if (!accessibleExam) {
    return NextResponse.json({ error: "考试不存在" }, { status: 404 });
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
  try {
    const exam = await prisma.$transaction(async (tx) => {
      const current = await tx.exam.findFirst({ where: getExamAccessWhere(auth.user, examId) });
      if (!current) throw new ExamLifecycleError(404, "考试不存在");
      if (current.archivedAt) throw new ExamLifecycleError(409, "已归档考试只允许查看历史记录或取消归档");
      if (current.status === "ended") {
        throw new ExamLifecycleError(409, "已结束的考试不能再修改");
      }
      if (current.status === "draft" && payload.status === "ended") {
        throw new ExamLifecycleError(409, "草稿考试不能直接结束，请先发布考试");
      }
      if (
        current.status === "published" &&
        payload.status === "draft"
      ) {
        throw new ExamLifecycleError(409, "请使用取消发布操作；已有考试记录时不能改回草稿");
      }
      const publishedCoreChanged =
        current.status === "published" &&
        (payload.title !== current.title ||
          (payload.description || null) !== current.description ||
          payload.durationMin !== current.durationMin ||
          payload.examType !== current.examType);
      if (publishedCoreChanged) {
        throw new ExamLifecycleError(409, "已发布考试只能切换 AI 开关或结束考试");
      }
      const examProblems = await tx.examProblem.findMany({
        where: { examId },
        include: {
          problem: {
            select: {
              archivedAt: true,
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
      if (current.status === "draft" && mismatchedProblem) {
        throw new ExamLifecycleError(400, `题目《${mismatchedProblem.problem.title}》与当前考试类型不一致，请先移除该题`);
      }

      if (current.status === "draft" && payload.status === "published") {
        if (!payload.durationMin || payload.durationMin <= 0) {
          throw new ExamLifecycleError(400, "考试时长必须大于 0 分钟");
        }
        if (examProblems.length === 0) {
          throw new ExamLifecycleError(400, "考试至少需要添加 1 道题后才能发布");
        }
        const archivedProblem = examProblems.find(
          (item) => item.problem.archivedAt !== null,
        );
        if (archivedProblem) {
          throw new ExamLifecycleError(400, `题目《${archivedProblem.problem.title}》已经下架，请先从考试中移除`);
        }
        const invalidProblem = examProblems.find((item) => item.score <= 0);
        if (invalidProblem) {
          throw new ExamLifecycleError(400, `题目《${invalidProblem.problem.title}》的分值必须大于 0`);
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
            throw new ExamLifecycleError(400, `客观题《${invalidObjectiveProblem.problem.title}》的小题分值配置无效`);
          }
        }
      }

      if (
        current.status === "draft" &&
        payload.status === "published"
      ) {
        await snapshotExamProblems(tx, examId);
      }
      const changed = await tx.exam.updateMany({
        where: { ...getExamAccessWhere(auth.user, examId), status: current.status, archivedAt: null },
        data: {
          title: payload.title,
          description: payload.description || null,
          durationMin: payload.durationMin,
          status: payload.status,
          examType: payload.examType,
          aiEnabled: payload.aiEnabled,
        },
      });
      if (changed.count !== 1) throw new ExamLifecycleError(409, "考试状态已变化，请刷新后重试");
      return tx.exam.findUniqueOrThrow({ where: { id: examId } });
    });
    if (exam.status === "ended") await settleEndedExamRecords(examId);
    return NextResponse.json({ exam });
  } catch (error) {
    if (error instanceof ExamLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[EXAM_UPDATE_ERROR]", { examId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "更新考试失败，请刷新后重试" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }
  try {
    await deleteUnusedDraftExam(auth.user, examId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ExamLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.includes("EXAM_HISTORY_REQUIRED")) {
      return NextResponse.json({ error: "考试包含需保留的历史数据，不能永久删除" }, { status: 409 });
    }
    console.error("[EXAM_DELETE_ERROR]", { examId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "删除考试失败，请刷新后重试" }, { status: 500 });
  }
}
