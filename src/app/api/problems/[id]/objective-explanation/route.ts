import { NextRequest, NextResponse } from "next/server";
import { ObjectiveAiExplanationError } from "@/lib/objectiveAiExplanation";
import {
  parseObjectiveAiExplanationPayload,
  serializeObjectiveAiExplanationPayload,
} from "@/lib/objectiveAiExplanation";
import {
  findValidObjectiveExplanation,
  generateAndStoreObjectiveExplanation,
  ObjectiveExplanationWorkflowError,
  prepareObjectiveExplanation,
  type ObjectiveExplanationResult,
} from "@/lib/objectiveAiExplanationWorkflow";
import { reserveObjectiveAiExplanation } from "@/lib/objectiveAiExplanationRateLimit";
import { getAiCooldownSeconds } from "@/lib/aiRuntimeSettings";
import {
  AiUsageAuditError,
  completeAiUsageTurn,
  createPendingAiUsageTurn,
  emptyAiProviderTelemetry,
  failAiUsageTurn,
  findExistingAiUsageTurn,
  isValidAiClientId,
  normalizeAiClientId,
} from "@/lib/aiUsageAudit";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { boolSetting, getSetting } from "@/lib/settings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedBodyKeys = new Set([
  "conversationId",
  "force",
  "itemIndex",
  "requestId",
]);

function responseForResult({
  conversationId,
  cooldownSeconds = 0,
  replayed = false,
  requestId,
  result,
}: {
  conversationId: string;
  cooldownSeconds?: number;
  replayed?: boolean;
  requestId: string;
  result: ObjectiveExplanationResult;
}) {
  return NextResponse.json({
    cached: result.cached,
    conversationId,
    cooldownSeconds,
    explanation: result.payload,
    replayed,
    requestId,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PayloadTooLargeError
            ? error.message
            : "请求格式不合法",
      },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedBodyKeys.has(key))) {
    return NextResponse.json(
      { error: "请求包含不允许的字段" },
      { status: 400 },
    );
  }
  const itemIndex = Number(record.itemIndex);
  if (!Number.isInteger(itemIndex) || itemIndex <= 0) {
    return NextResponse.json({ error: "小题序号不合法" }, { status: 400 });
  }
  if (record.force !== undefined && typeof record.force !== "boolean") {
    return NextResponse.json({ error: "force 参数不合法" }, { status: 400 });
  }
  if (
    record.requestId !== undefined &&
    !isValidAiClientId(record.requestId)
  ) {
    return NextResponse.json({ error: "AI 请求标识不合法" }, { status: 400 });
  }
  if (
    record.conversationId !== undefined &&
    !isValidAiClientId(record.conversationId)
  ) {
    return NextResponse.json({ error: "AI 对话标识不合法" }, { status: 400 });
  }
  const force = record.force === true;
  const requestId = normalizeAiClientId(record.requestId);
  const conversationId = normalizeAiClientId(record.conversationId);

  const [
    masterSetting,
    studentSetting,
    profile,
    priorSubmission,
    activeExamRecord,
  ] =
    await Promise.all([
      getSetting("aiObjectiveExplanationEnabled"),
      getSetting("aiStudentObjectiveExplanationEnabled"),
      prisma.studentProfile.findUnique({
        where: { userId: auth.user.id },
        select: { objectiveAiAccessEnabled: true },
      }),
      prisma.submission.findFirst({
        where: {
          problemId,
          submissionType: "practice",
          userId: auth.user.id,
        },
        select: { id: true },
      }),
      prisma.examRecord.findFirst({
        where: {
          status: "in_progress",
          userId: auth.user.id,
          exam: { problems: { some: { problemId } } },
        },
        select: { id: true },
      }),
    ]);
  if (!boolSetting(masterSetting) || !boolSetting(studentSetting)) {
    return NextResponse.json(
      { error: "学生选择判断题 AI 解析尚未开启" },
      { status: 403 },
    );
  }
  if (!profile?.objectiveAiAccessEnabled) {
    return NextResponse.json(
      { error: "你的选择判断题 AI 权限尚未开通" },
      { status: 403 },
    );
  }
  if (activeExamRecord) {
    return NextResponse.json(
      { error: "正式考试进行中不能查看该题 AI 解析" },
      { status: 403 },
    );
  }
  if (!priorSubmission) {
    return NextResponse.json(
      {
        code: "OBJECTIVE_ATTEMPT_REQUIRED",
        error: "请先提交一次当前选择判断题，再查看 AI 解析",
      },
      { status: 409 },
    );
  }

  let prepared;
  try {
    prepared = await prepareObjectiveExplanation({ itemIndex, problemId });
  } catch (error) {
    if (error instanceof ObjectiveExplanationWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "选择判断题解析准备失败" },
      { status: 503 },
    );
  }

  let existingTurn: Awaited<ReturnType<typeof findExistingAiUsageTurn>>;
  try {
    existingTurn = await findExistingAiUsageTurn({
      requestId,
      studentId: auth.user.id,
    });
  } catch {
    return NextResponse.json(
      { error: "AI 使用记录暂时无法读取，请稍后再试" },
      { status: 503 },
    );
  }
  if (existingTurn.kind === "forbidden") {
    return NextResponse.json({ error: "AI 请求标识无权使用" }, { status: 403 });
  }
  if (existingTurn.kind === "pending") {
    return NextResponse.json(
      {
        conversationId: existingTurn.conversationId,
        error: "AI 正在处理这次请求，请等待完成",
        requestId: existingTurn.requestId,
      },
      { status: 409 },
    );
  }
  if (existingTurn.kind === "completed") {
    const payload = parseObjectiveAiExplanationPayload(existingTurn.advice);
    if (!payload) {
      return NextResponse.json(
        { error: "历史 AI 解析记录格式异常，请重新发起请求" },
        { status: 502 },
      );
    }
    return responseForResult({
      conversationId: existingTurn.conversationId,
      replayed: true,
      requestId: existingTurn.requestId,
      result: {
        cached: existingTurn.cached,
        completionTokens: null,
        payload,
        promptTokens: null,
        totalTokens: null,
      },
    });
  }
  if (existingTurn.kind === "failed") {
    return NextResponse.json(
      {
        conversationId: existingTurn.conversationId,
        error: existingTurn.error,
        replayed: true,
        requestId: existingTurn.requestId,
      },
      { status: 502 },
    );
  }

  const cached = force ? null : await findValidObjectiveExplanation(prepared);
  const cooldownSeconds =
    (await getAiCooldownSeconds("objective", "student")) ?? 30;
  let release = () => {};
  let onProviderRequest: (() => void) | undefined;
  let providerCallCount = 0;

  if (!cached) {
    const reservation = reserveObjectiveAiExplanation({
      accountId: auth.user.id,
      cooldownSeconds,
      itemIndex,
      problemId,
    });
    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error:
            reservation.reason === "cooldown"
              ? `生成过于频繁，请 ${reservation.retryAfterSeconds} 秒后再试`
              : "该题或其他 AI 任务正在生成，请稍后再试",
          retryAfterSeconds: reservation.retryAfterSeconds,
        },
        {
          headers: { "Retry-After": String(reservation.retryAfterSeconds) },
          status: 429,
        },
      );
    }
    release = reservation.release;
    onProviderRequest = () => {
      providerCallCount += 1;
      reservation.markProviderRequest();
    };
  }

  try {
    await createPendingAiUsageTurn({
      aiProfile: "objective",
      clientConversationId: conversationId,
      examId: null,
      examTitle: null,
      mode: "objective_explanation",
      objectiveItemIndex: itemIndex,
      problemId,
      problemTitle: prepared.problem.title,
      requestId,
      scope: "practice",
      studentId: auth.user.id,
      userContent: force
        ? `重新生成第 ${itemIndex} 题 AI 解析`
        : `查看第 ${itemIndex} 题 AI 解析`,
    });
  } catch (error) {
    release();
    return NextResponse.json(
      {
        error:
          error instanceof AiUsageAuditError && error.reason === "forbidden"
            ? error.message
            : "AI 使用记录暂时无法保存，请稍后再试",
      },
      { status: error instanceof AiUsageAuditError ? 403 : 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const result =
      cached ??
      (await generateAndStoreObjectiveExplanation({
        generatedById: auth.user.id,
        onProviderRequest,
        prepared,
      }));
    await completeAiUsageTurn({
      advice: serializeObjectiveAiExplanationPayload(result.payload),
      cached: result.cached,
      completedAt: new Date(),
      providerCallCount,
      requestId,
      startedAt,
      telemetry: result.cached
        ? emptyAiProviderTelemetry
        : {
            completionTokens: result.completionTokens,
            model: result.payload.model,
            promptTokens: result.promptTokens,
            totalTokens: result.totalTokens,
          },
    });
    return responseForResult({
      conversationId,
      cooldownSeconds: result.cached ? 0 : cooldownSeconds,
      requestId,
      result,
    });
  } catch (error) {
    const known =
      error instanceof ObjectiveAiExplanationError ? error : null;
    const message = known?.message ?? "AI 解析生成失败，请稍后重试";
    await failAiUsageTurn({
      completedAt: new Date(),
      errorMessage: message,
      providerCallCount,
      requestId,
      startedAt,
      telemetry: emptyAiProviderTelemetry,
    }).catch(() => undefined);
    return NextResponse.json(
      {
        cooldownSeconds: providerCallCount > 0 ? cooldownSeconds : 0,
        error: message,
      },
      { status: known?.kind === "input-too-large" ? 400 : 502 },
    );
  } finally {
    release();
  }
}
