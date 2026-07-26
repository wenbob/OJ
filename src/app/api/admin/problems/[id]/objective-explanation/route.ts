import { NextRequest, NextResponse } from "next/server";
import {
  createAiProviderFingerprint,
  getEffectiveAiProviderConfig,
} from "@/lib/aiProvider";
import {
  buildObjectiveExplanationPrompt,
  createObjectiveExplanationSourceHash,
  generateObjectiveAiExplanation,
  ObjectiveAiExplanationError,
  parseObjectiveExplanationCore,
  serializeObjectiveExplanationCore,
  toObjectiveAiExplanationPayload,
} from "@/lib/objectiveAiExplanation";
import { reserveObjectiveAiExplanation } from "@/lib/objectiveAiExplanationRateLimit";
import {
  normalizeObjectiveAnswer,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
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

function explanationResponse({
  cached,
  core,
  correctAnswer,
  generatedAt,
  itemIndex,
  model,
}: {
  cached: boolean;
  core: NonNullable<ReturnType<typeof parseObjectiveExplanationCore>>;
  correctAnswer: string;
  generatedAt: Date;
  itemIndex: number;
  model: string | null;
}) {
  return NextResponse.json({
    cached,
    explanation: toObjectiveAiExplanationPayload({
      core,
      correctAnswer,
      generatedAt,
      itemIndex,
      model,
    }),
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
  if (force && auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "只有管理员可以重新生成共享解析" },
      { status: 403 },
    );
  }

  const enabled = boolSetting(
    await getSetting("aiObjectiveExplanationEnabled"),
  );
  if (!enabled) {
    return NextResponse.json(
      { error: "选择判断题 AI 解析尚未开启" },
      { status: 403 },
    );
  }

  const problem = await prisma.problem.findFirst({
    where: {
      archivedAt: null,
      id: problemId,
      problemType: "objective",
    },
    select: {
      category: true,
      description: true,
      difficulty: true,
      objectiveItems: true,
      title: true,
    },
  });
  if (!problem) {
    return NextResponse.json(
      { error: "选择判断题不存在或已经下架" },
      { status: 404 },
    );
  }

  const items = parseObjectiveItems(problem.objectiveItems);
  if (validateObjectiveItems(items).length > 0) {
    return NextResponse.json(
      { error: "该题的选择判断数据不完整，请先修正题目" },
      { status: 400 },
    );
  }
  const item = items[itemIndex - 1];
  if (!item) {
    return NextResponse.json({ error: "小题序号超出范围" }, { status: 400 });
  }

  let aiConfig;
  try {
    aiConfig = await getEffectiveAiProviderConfig();
  } catch {
    return NextResponse.json(
      { error: "当前 AI 服务配置无效，请先检查系统设置" },
      { status: 503 },
    );
  }
  const providerFingerprint = createAiProviderFingerprint(aiConfig);
  const sourceHash = createObjectiveExplanationSourceHash({
    ...problem,
    item,
    itemIndex,
  });
  const correctAnswer = normalizeObjectiveAnswer(item.answer);
  const expectedLabels = item.options.map((option) => option.label);

  const findValidCache = async () => {
    const cached = await prisma.objectiveAiExplanation.findUnique({
      where: { problemId_itemIndex: { itemIndex, problemId } },
    });
    if (
      !cached ||
      cached.sourceHash !== sourceHash ||
      cached.providerFingerprint !== providerFingerprint ||
      cached.correctAnswer !== correctAnswer
    ) {
      return null;
    }
    const core = parseObjectiveExplanationCore(
      cached.explanationJson,
      expectedLabels,
    );
    return core ? { cached, core } : null;
  };

  if (!force) {
    const existing = await findValidCache();
    if (existing) {
      return explanationResponse({
        cached: true,
        core: existing.core,
        correctAnswer,
        generatedAt: existing.cached.generatedAt,
        itemIndex,
        model: existing.cached.model,
      });
    }
  }

  const reservation = reserveObjectiveAiExplanation({
    itemIndex,
    problemId,
    staffId: auth.user.id,
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
    const prompt = buildObjectiveExplanationPrompt({
      ...problem,
      item,
      itemIndex,
    });
    const generated = await generateObjectiveAiExplanation({
      config: aiConfig,
      item,
      prompt,
    });
    const generatedAt = new Date();
    const saved = await prisma.objectiveAiExplanation.upsert({
      where: { problemId_itemIndex: { itemIndex, problemId } },
      create: {
        completionTokens: generated.completionTokens,
        correctAnswer,
        explanationJson: serializeObjectiveExplanationCore(generated.core),
        generatedAt,
        generatedById: auth.user.id,
        itemIndex,
        model: generated.model,
        problemId,
        promptTokens: generated.promptTokens,
        providerFingerprint,
        sourceHash,
        totalTokens: generated.totalTokens,
      },
      update: {
        completionTokens: generated.completionTokens,
        correctAnswer,
        explanationJson: serializeObjectiveExplanationCore(generated.core),
        generatedAt,
        generatedById: auth.user.id,
        model: generated.model,
        promptTokens: generated.promptTokens,
        providerFingerprint,
        sourceHash,
        totalTokens: generated.totalTokens,
      },
    });
    return explanationResponse({
      cached: false,
      core: generated.core,
      correctAnswer,
      generatedAt: saved.generatedAt,
      itemIndex,
      model: saved.model,
    });
  } catch (error) {
    const known =
      error instanceof ObjectiveAiExplanationError ? error : null;
    const status = known?.kind === "input-too-large" ? 400 : 502;
    return NextResponse.json(
      {
        error: known?.message ?? "AI 解析生成失败，请稍后重试",
      },
      { status },
    );
  } finally {
    reservation.release();
  }
}
