import { NextRequest, NextResponse } from "next/server";
import { PROBLEM_RUN_COOLDOWN_MS, reserveProblemRun } from "@/lib/problemRunRateLimit";
import { requireApiUser } from "@/lib/auth";
import { isExamSubmissionOnTime } from "@/lib/examScoring";
import { runCppCode } from "@/lib/judge";
import {
  JUDGE_RETRY_AFTER_SECONDS,
  JudgeInfrastructureError,
} from "@/lib/judgeErrors";
import {
  enqueueJudgeTask,
  JudgeQueueFullError,
  JudgeQueueTimeoutError,
} from "@/lib/judgeQueue";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { getDisplaySamples } from "@/lib/problemSamples";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  ensureTextWithinByteLimit,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { getJudgeDefaultSettings } from "@/lib/settings";

const CUSTOM_INPUT_MAX_BYTES = 32 * 1024;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readMode(value: unknown) {
  return value === "samples" || value === "custom" ? value : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!auth.user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await context.params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.problemRunJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }

  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const mode = readMode(record.mode);
  const code = typeof record.code === "string" ? record.code : "";
  const customInput =
    typeof record.customInput === "string" ? record.customInput : "";
  const examId =
    record.examId === undefined || record.examId === null || record.examId === ""
      ? null
      : Number(record.examId);
  const receivedAt = new Date();

  if (!mode) {
    return NextResponse.json({ error: "试运行类型不合法" }, { status: 400 });
  }
  if (typeof record.code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "代码不能为空" }, { status: 400 });
  }
  if (
    record.customInput !== undefined &&
    typeof record.customInput !== "string"
  ) {
    return NextResponse.json({ error: "自定义输入格式不合法" }, { status: 400 });
  }
  if (mode === "samples" && record.customInput !== undefined) {
    return NextResponse.json(
      { error: "运行样例时不能由浏览器提供样例输入" },
      { status: 400 },
    );
  }
  if (
    record.input !== undefined ||
    record.expectedOutput !== undefined ||
    record.samples !== undefined
  ) {
    return NextResponse.json(
      { error: "样例输入和标准输出只能由服务端读取" },
      { status: 400 },
    );
  }
  if (record.learningAssignmentId !== undefined) {
    return NextResponse.json(
      { error: "试运行不能计入专项练习" },
      { status: 400 },
    );
  }
  if (examId !== null && !Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  try {
    ensureTextWithinByteLimit(code, REQUEST_LIMITS.codeBytes, "代码");
    ensureTextWithinByteLimit(customInput, CUSTOM_INPUT_MAX_BYTES, "自定义输入");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PayloadTooLargeError
            ? error.message
            : "试运行内容过大",
      },
      { status: 413 },
    );
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      archivedAt: true,
      problemType: true,
      sampleInput: true,
      sampleOutput: true,
      testCases: {
        where: { isSample: true },
        orderBy: { id: "asc" },
        select: { id: true, input: true, output: true },
      },
    },
  });

  if (!problem || problem.archivedAt) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  if (normalizeProblemType(problem.problemType) !== "programming") {
    return NextResponse.json(
      { error: "试运行只支持编程题" },
      { status: 400 },
    );
  }

  const samples = getDisplaySamples({
    sampleInput: problem.sampleInput,
    sampleOutput: problem.sampleOutput,
    testCases: problem.testCases,
  });
  if (mode === "samples" && samples.length === 0) {
    return NextResponse.json(
      { error: "该题暂无公开样例，请使用自定义输入" },
      { status: 400 },
    );
  }

  if (examId !== null) {
    if (auth.user.role !== "student") {
      return NextResponse.json(
        { error: "后台考试练习不使用正式考试 ID" },
        { status: 403 },
      );
    }

    const [exam, examRecord] = await Promise.all([
      prisma.exam.findUnique({
        where: { id: examId },
        select: {
          durationMin: true,
          examType: true,
          status: true,
          problems: {
            where: { problemId },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.examRecord.findUnique({
        where: { examId_userId: { examId, userId: auth.user.id } },
        select: { startedAt: true, status: true },
      }),
    ]);

    if (!exam || exam.problems.length === 0) {
      return NextResponse.json(
        { error: "考试不存在，或当前题目不属于该考试" },
        { status: 404 },
      );
    }
    if (exam.examType !== "programming") {
      return NextResponse.json(
        { error: "考试类型与题目类型不一致" },
        { status: 400 },
      );
    }
    if (exam.status !== "published") {
      return NextResponse.json(
        { error: "该考试未发布或已经结束" },
        { status: 403 },
      );
    }
    if (!examRecord || examRecord.status !== "in_progress") {
      return NextResponse.json(
        { error: "考试未开始或已经结束" },
        { status: 403 },
      );
    }
    if (
      !isExamSubmissionOnTime({
        createdAt: receivedAt,
        durationMin: exam.durationMin,
        startedAt: examRecord.startedAt,
      })
    ) {
      return NextResponse.json(
        { error: "考试已超时，不能继续试运行" },
        { status: 403 },
      );
    }
  }

  const reservation = reserveProblemRun({ userId: auth.user.id });
  if (!reservation.allowed) {
    const error =
      reservation.reason === "busy"
        ? "你已有一个试运行正在进行，请等待完成"
        : `试运行过于频繁，请 ${reservation.retryAfterSeconds} 秒后再试`;
    return NextResponse.json(
      { error, retryAfterSeconds: reservation.retryAfterSeconds },
      {
        headers: { "Retry-After": String(reservation.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  let started = false;
  try {
    const judgeDefaults = await getJudgeDefaultSettings();
    const run = await enqueueJudgeTask(
      () => {
        started = true;
        return runCppCode({
          code,
          expectedOutputs:
            mode === "samples"
              ? samples.map((sample) => sample.output)
              : undefined,
          inputs:
            mode === "samples"
              ? samples.map((sample) => sample.input)
              : [customInput],
          memoryLimitMb: judgeDefaults.memoryLimitMb,
          timeLimitMs: judgeDefaults.timeLimitMs,
        });
      },
      { priority: "trial" },
    );

    return NextResponse.json({
      cooldownSeconds: Math.ceil(PROBLEM_RUN_COOLDOWN_MS / 1000),
      run,
    });
  } catch (error) {
    const message =
      error instanceof JudgeQueueFullError ||
      error instanceof JudgeQueueTimeoutError
        ? "评测队列繁忙，请稍后再试"
        : error instanceof JudgeInfrastructureError
          ? "评测服务暂时不可用，请稍后再试"
          : "试运行服务暂时不可用，请稍后再试";
    return NextResponse.json(
      { error: message, retryAfterSeconds: JUDGE_RETRY_AFTER_SECONDS },
      {
        headers: { "Retry-After": String(JUDGE_RETRY_AFTER_SECONDS) },
        status: 503,
      },
    );
  } finally {
    if (started) {
      reservation.complete();
    } else {
      reservation.cancel();
    }
  }
}
