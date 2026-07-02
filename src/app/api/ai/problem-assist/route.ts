import { NextRequest, NextResponse } from "next/server";
import {
  buildAiAssistPrompt,
  isAiAssistTimeoutError,
  requestDeepSeekAdvice,
  type AiAssistMode,
} from "@/lib/aiAssist";
import {
  createAiAssistAdviceCacheKey,
  getCachedAiAssistAdvice,
  setCachedAiAssistAdvice,
} from "@/lib/aiAssistCache";
import { consumeAiAssistCooldown } from "@/lib/aiAssistRateLimit";
import { requireApiUser } from "@/lib/auth";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { boolSetting, getSetting } from "@/lib/settings";

function isMode(value: unknown): value is AiAssistMode {
  return value === "hint";
}

async function requestValidAiAdvice(prompt: string) {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const advice = (await requestDeepSeekAdvice(prompt)).trim();
      if (!advice) {
        throw new Error("AI 这次没有返回清楚的思路，请稍后再试。");
      }
      return advice;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableAiAssistError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI 服务异常");
}

function isRetryableAiAssistError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("没有返回清楚的思路") ||
    error.message.includes("返回格式异常") ||
    error.message.includes("请求失败：5")
  );
}

function safeAiAssistErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (isAiAssistTimeoutError(error)) {
    return "AI 服务响应超时，请稍后再试。";
  }
  if (message.includes("未配置")) return "AI 服务暂未配置，请联系老师。";
  if (message.includes("没有返回清楚的思路")) {
    return "AI 这次没有返回清楚的思路，请稍后再试。";
  }
  if (message.includes("还没写出最终思路")) {
    return "AI 还在思考这道题，这次没写出最终思路，请稍后再试。";
  }
  if (message.includes("返回格式异常")) {
    return "AI 服务返回异常，请稍后再试。";
  }
  if (message.includes("响应超时")) {
    return "AI 服务响应超时，请稍后再试。";
  }
  if (message.includes("请求失败：429")) {
    return "AI 服务正忙，请稍后再试。";
  }
  return "AI 服务异常，请稍后再试。";
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;
  if (!auth.user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.aiAssistJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }

  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const problemId = Number(record.problemId);
  const examId =
    record.examId === undefined || record.examId === null || record.examId === ""
      ? null
      : Number(record.examId);
  const mode = record.mode;

  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }
  if (examId !== null && !Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }
  if (!isMode(mode)) {
    return NextResponse.json({ error: "AI 类型不合法" }, { status: 400 });
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      testCases: {
        where: { isSample: true },
        orderBy: { id: "asc" },
        select: { input: true, output: true },
      },
    },
  });

  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  if (normalizeProblemType(problem.problemType) !== "programming") {
    return NextResponse.json(
      { error: "AI 助手暂只支持编程题" },
      { status: 400 },
    );
  }

  if (examId === null) {
    const enabled = boolSetting(await getSetting("aiPracticeEnabled"));
    if (!enabled) {
      return NextResponse.json({ error: "日常练习 AI 已关闭" }, { status: 403 });
    }
  } else {
    const [exam, examRecord] = await Promise.all([
      prisma.exam.findUnique({
        where: { id: examId },
        include: {
          problems: {
            where: { problemId },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.examRecord.findUnique({
        where: { examId_userId: { examId, userId: auth.user.id } },
      }),
    ]);

    if (!exam || exam.problems.length === 0) {
      return NextResponse.json(
        { error: "考试不存在，或当前题目不属于该考试" },
        { status: 404 },
      );
    }
    if (!exam.aiEnabled) {
      return NextResponse.json({ error: "本场考试 AI 已关闭" }, { status: 403 });
    }
    if (!examRecord || examRecord.status !== "in_progress") {
      return NextResponse.json({ error: "考试未开始或已结束" }, { status: 403 });
    }
  }

  const prompt = buildAiAssistPrompt({
    mode,
    problem: {
      title: problem.title,
      description: problem.description,
      inputDescription: problem.inputDescription,
      outputDescription: problem.outputDescription,
      dataRange: problem.dataRange,
      samples: problem.testCases,
    },
  });

  const cacheKey = createAiAssistAdviceCacheKey({ mode, problemId, prompt });
  const cachedAdvice = getCachedAiAssistAdvice({ key: cacheKey });
  if (cachedAdvice) {
    return NextResponse.json({ advice: cachedAdvice, cached: true });
  }

  const cooldown = consumeAiAssistCooldown({
    userId: auth.user.id,
    problemId,
    examId,
    mode,
  });
  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: `AI 使用过于频繁，请 ${cooldown.retryAfterSeconds} 秒后再试`,
        retryAfterSeconds: cooldown.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  try {
    const advice = await requestValidAiAdvice(prompt);
    setCachedAiAssistAdvice({ advice, key: cacheKey });
    return NextResponse.json({ advice, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: safeAiAssistErrorMessage(error) },
      { status: 502 },
    );
  }
}
