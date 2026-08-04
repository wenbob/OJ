import { NextRequest, NextResponse } from "next/server";
import { ObjectiveAiExplanationError } from "@/lib/objectiveAiExplanation";
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
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { boolSetting, getSetting } from "@/lib/settings";
import { requireStaffApiUser } from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedBodyKeys = new Set(["force", "itemIndex"]);

function parseProblemId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function explanationResponse(
  result: ObjectiveExplanationResult,
  cooldownSeconds = 0,
) {
  return NextResponse.json({
    cached: result.cached,
    cooldownSeconds,
    explanation: result.payload,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = parseProblemId(id);
  if (!problemId) {
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
  const force = record.force === true;

  const enabled = boolSetting(
    await getSetting("aiObjectiveExplanationEnabled"),
  );
  if (!enabled) {
    return NextResponse.json(
      { error: "选择判断题 AI 解析尚未开启" },
      { status: 403 },
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

  if (!force) {
    const existing = await findValidObjectiveExplanation(prepared);
    if (existing) return explanationResponse(existing);
  }

  const role = auth.user.role === "admin" ? "admin" : "teacher";
  const cooldownSeconds =
    (await getAiCooldownSeconds("objective", role)) ?? 30;
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

  try {
    const generated = await generateAndStoreObjectiveExplanation({
      generatedById: auth.user.id,
      onProviderRequest: reservation.markProviderRequest,
      prepared,
    });
    return explanationResponse(generated, cooldownSeconds);
  } catch (error) {
    const known =
      error instanceof ObjectiveAiExplanationError ? error : null;
    return NextResponse.json(
      {
        cooldownSeconds: reservation.providerRequestStarted()
          ? cooldownSeconds
          : 0,
        error: known?.message ?? "AI 解析生成失败，请稍后重试",
      },
      { status: known?.kind === "input-too-large" ? 400 : 502 },
    );
  } finally {
    reservation.release();
  }
}
