import { NextRequest, NextResponse } from "next/server";
import {
  AI_ASSIST_MAX_ASSISTANT_MESSAGE_CHARS,
  AI_ASSIST_MAX_CODE_BYTES,
  AI_ASSIST_MAX_HISTORY_MESSAGES,
  AI_ASSIST_MAX_QUESTION_CHARS,
  AI_ASSIST_MAX_USER_MESSAGE_CHARS,
  buildAiAssistPrompt,
  isAiAssistTimeoutError,
  requestDeepSeekAdvice,
  type AiAssistHistoryMessage,
  type AiAssistMode,
} from "@/lib/aiAssist";
import {
  createAiAssistAdviceCacheKey,
  getCachedAiAssistAdvice,
  setCachedAiAssistAdvice,
} from "@/lib/aiAssistCache";
import {
  consumeAiAssistCooldown,
  reserveAiAssistRequest,
} from "@/lib/aiAssistRateLimit";
import { requireApiUser } from "@/lib/auth";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  ensureTextWithinByteLimit,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { boolSetting, getSetting } from "@/lib/settings";

function readMode(value: unknown): AiAssistMode | null {
  if (value === "hint") return "overview";
  if (
    value === "overview" ||
    value === "next_step" ||
    value === "code_review" ||
    value === "question"
  ) {
    return value;
  }
  return null;
}

function readHistory(value: unknown) {
  if (value === undefined || value === null) {
    return { error: null, history: [] as AiAssistHistoryMessage[] };
  }
  if (!Array.isArray(value) || value.length > AI_ASSIST_MAX_HISTORY_MESSAGES) {
    return { error: "AI 对话记录不合法", history: [] as AiAssistHistoryMessage[] };
  }

  const history: AiAssistHistoryMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { error: "AI 对话记录不合法", history: [] as AiAssistHistoryMessage[] };
    }
    const record = item as Record<string, unknown>;
    const role = record.role;
    const content = typeof record.content === "string" ? record.content.trim() : "";
    const maxChars =
      role === "user"
        ? AI_ASSIST_MAX_USER_MESSAGE_CHARS
        : AI_ASSIST_MAX_ASSISTANT_MESSAGE_CHARS;
    if (
      (role !== "user" && role !== "assistant") ||
      !content ||
      content.length > maxChars
    ) {
      return { error: "AI 对话记录不合法", history: [] as AiAssistHistoryMessage[] };
    }
    history.push({ role, content });
  }

  return { error: null, history };
}

async function requestValidAiAdvice(prompt: string) {
  const maxAttempts = 2;
  let lastError: unknown;
  let retryInstruction =
    "上一次回答没有通过安全检查。请不要抄写、引用或改写学生的任何一行源码，不要出现代码符号、代码语句或完整表达式。只用行号和自然语言说明问题与下一步。";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const attemptPrompt =
        attempt === 1
          ? prompt
          : `${prompt}

重新回答要求：${retryInstruction}`;
      const advice = (await requestDeepSeekAdvice(attemptPrompt)).trim();
      if (!advice) {
        throw new Error("AI 这次没有返回清楚的思路，请稍后再试。");
      }
      return advice;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.includes("还没写出最终思路")
      ) {
        retryInstruction =
          "上一次把时间都用在思考，没有写出最终正文。这次不要展开长推理，直接给出不超过 300 字的最终提示。仍然不能抄写源码或提供代码。";
      }
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
    error.message.includes("还没写出最终思路") ||
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
  const mode = readMode(record.mode);
  const code = typeof record.code === "string" ? record.code : "";
  const question =
    typeof record.question === "string" ? record.question.trim() : "";
  const parsedHistory = readHistory(record.history);

  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }
  if (examId !== null && !Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }
  if (!mode) {
    return NextResponse.json({ error: "AI 类型不合法" }, { status: 400 });
  }
  if (record.code !== undefined && typeof record.code !== "string") {
    return NextResponse.json({ error: "当前代码格式不合法" }, { status: 400 });
  }
  if (record.question !== undefined && typeof record.question !== "string") {
    return NextResponse.json({ error: "问题格式不合法" }, { status: 400 });
  }
  if (parsedHistory.error) {
    return NextResponse.json({ error: parsedHistory.error }, { status: 400 });
  }
  if (mode === "question" && !question) {
    return NextResponse.json(
      { error: "请输入与当前题目有关的问题" },
      { status: 400 },
    );
  }
  if (question.length > AI_ASSIST_MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: `问题不能超过 ${AI_ASSIST_MAX_QUESTION_CHARS} 字` },
      { status: 400 },
    );
  }
  try {
    ensureTextWithinByteLimit(code, AI_ASSIST_MAX_CODE_BYTES, "当前代码");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PayloadTooLargeError
            ? error.message
            : "当前代码内容过大",
      },
      { status: 413 },
    );
  }

  const [problem, studentProfile] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        testCases: {
          where: { isSample: true },
          orderBy: { id: "asc" },
          select: { input: true, output: true },
        },
      },
    }),
    prisma.studentProfile.findUnique({
      where: { userId: auth.user.id },
      select: { aiAccessEnabled: true },
    }),
  ]);

  if (!problem || problem.archivedAt) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  if (normalizeProblemType(problem.problemType) !== "programming") {
    return NextResponse.json(
      { error: "AI 助手暂只支持编程题" },
      { status: 400 },
    );
  }
  if (!studentProfile?.aiAccessEnabled) {
    return NextResponse.json(
      { error: "你的 AI 对话权限尚未开通" },
      { status: 403 },
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

  const latestSubmission =
    mode === "overview"
      ? null
      : await prisma.submission.findFirst({
          where: {
            userId: auth.user.id,
            problemId,
            ...(examId === null
              ? { submissionType: "practice" }
              : { examId, submissionType: "exam" }),
          },
          orderBy: { createdAt: "desc" },
          select: {
            errorMessage: true,
            passedCount: true,
            status: true,
            totalCount: true,
          },
        });

  const prompt = buildAiAssistPrompt({
    code: mode === "overview" ? "" : code,
    history: mode === "overview" ? [] : parsedHistory.history,
    latestSubmission,
    mode,
    problem: {
      title: problem.title,
      description: problem.description,
      inputDescription: problem.inputDescription,
      outputDescription: problem.outputDescription,
      dataRange: problem.dataRange,
      samples: problem.testCases,
    },
    question: mode === "question" ? question : "",
  });

  const cacheKey =
    mode === "overview"
      ? createAiAssistAdviceCacheKey({ mode, problemId, prompt })
      : null;

  const reservation = reserveAiAssistRequest({ userId: auth.user.id });
  if (!reservation.allowed) {
    const error =
      reservation.reason === "user_busy"
        ? "AI 正在思考你刚才的问题，请等待本次结束后再试"
        : "AI 正在帮助其他同学，请稍后再试";
    return NextResponse.json(
      {
        error,
        retryAfterSeconds: reservation.retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(reservation.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const cooldown = consumeAiAssistCooldown({
    userId: auth.user.id,
    problemId,
    examId,
    mode,
  });
  if (!cooldown.allowed) {
    reservation.release();
    return NextResponse.json(
      {
        error: `AI 使用过于频繁，请 ${cooldown.retryAfterSeconds} 秒后再试`,
        retryAfterSeconds: cooldown.retryAfterSeconds,
      },
      {
        headers: { "Retry-After": String(cooldown.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  if (cacheKey) {
    const cachedAdvice = getCachedAiAssistAdvice({ key: cacheKey });
    if (cachedAdvice) {
      reservation.release();
      return NextResponse.json({ advice: cachedAdvice, cached: true });
    }
  }

  try {
    const advice = await requestValidAiAdvice(prompt);
    if (cacheKey) {
      setCachedAiAssistAdvice({ advice, key: cacheKey });
    }
    return NextResponse.json({ advice, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: safeAiAssistErrorMessage(error) },
      { status: 502 },
    );
  } finally {
    reservation.release();
  }
}
