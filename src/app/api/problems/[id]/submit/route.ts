import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  finishExamRecord,
  isExamSubmissionOnTime,
  refreshFinishedExamScore,
} from "@/lib/examScoring";
import type { JudgeResult } from "@/lib/judge";
import { judgeCppCode } from "@/lib/judge";
import {
  JUDGE_RETRY_AFTER_SECONDS,
  JudgeInfrastructureError,
} from "@/lib/judgeErrors";
import {
  enqueueJudgeTask,
  JudgeQueueFullError,
  JudgeQueueTimeoutError,
} from "@/lib/judgeQueue";
import {
  judgeObjectiveSubmission,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  ensureTextWithinByteLimit,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { getJudgeDefaultSettings } from "@/lib/settings";
import { sanitizeSubmissionForStudent } from "@/lib/submissionVisibility";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const objectiveSubmissionCooldownMs = 30_000;

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = Number(id);
  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.codeBytes + 16 * 1024);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  // The server records this immediately after receiving the complete request
  // body. A long queue or Docker judge must not move an exam receipt past its
  // deadline.
  const receivedAt = new Date();
  const examId =
    record.examId === undefined || record.examId === null || record.examId === ""
      ? null
      : Number(record.examId);
  const learningAssignmentId =
    record.learningAssignmentId === undefined ||
    record.learningAssignmentId === null ||
    record.learningAssignmentId === ""
      ? null
      : Number(record.learningAssignmentId);

  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }
  if (examId !== null && !Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }
  if (learningAssignmentId !== null && !Number.isInteger(learningAssignmentId)) {
    return NextResponse.json({ error: "专项练习 ID 不合法" }, { status: 400 });
  }
  if (examId !== null && learningAssignmentId !== null) {
    return NextResponse.json(
      { error: "考试提交不能同时计入专项练习" },
      { status: 400 },
    );
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: { testCases: { orderBy: { id: "asc" } } },
  });

  if (!problem || problem.archivedAt) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  if (!code.trim()) {
    return NextResponse.json(
      {
        error:
          problem.problemType === "objective" ? "答案不能为空" : "代码不能为空",
      },
      { status: 400 },
    );
  }
  try {
    ensureTextWithinByteLimit(
      code,
      problem.problemType === "objective" ? 16 * 1024 : REQUEST_LIMITS.codeBytes,
      problem.problemType === "objective" ? "答案" : "代码",
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    throw error;
  }
  if (problem.problemType === "programming" && problem.testCases.length === 0) {
    return NextResponse.json({ error: "该题还没有测试点" }, { status: 400 });
  }
  const objectiveItems =
    problem.problemType === "objective"
      ? parseObjectiveItems(problem.objectiveItems)
      : [];
  if (problem.problemType === "objective") {
    const objectiveErrors = validateObjectiveItems(objectiveItems);
    if (objectiveErrors.length > 0) {
      return NextResponse.json(
        { error: `该客观题配置无效：${objectiveErrors[0]}` },
        { status: 400 },
      );
    }
  }

  const submissionType = examId === null ? "practice" : "exam";

  let assignmentProblemId: number | null = null;
  if (learningAssignmentId !== null) {
    if (auth.user.role !== "student") {
      return NextResponse.json({ error: "只有学生可以完成专项练习" }, { status: 403 });
    }
    if (problem.problemType !== "programming") {
      return NextResponse.json({ error: "专项练习只支持编程题" }, { status: 400 });
    }
    const assignment = await prisma.learningAssignment.findUnique({
      where: { id: learningAssignmentId },
      select: {
        status: true,
        studentId: true,
        problems: {
          where: { problemId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!assignment || assignment.studentId !== auth.user.id) {
      return NextResponse.json({ error: "无权使用该专项练习" }, { status: 403 });
    }
    if (assignment.status !== "active") {
      return NextResponse.json(
        { error: "该专项练习已归档，提交将不能计入进度" },
        { status: 403 },
      );
    }
    assignmentProblemId = assignment.problems[0]?.id ?? null;
    if (!assignmentProblemId) {
      return NextResponse.json(
        { error: "当前题目不属于该专项练习" },
        { status: 400 },
      );
    }
  }

  if (examId !== null) {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        problems: {
          where: { problemId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!exam || exam.problems.length === 0) {
      return NextResponse.json(
        { error: "考试不存在，或当前题目不属于该考试" },
        { status: 404 },
      );
    }
    if (exam.examType !== problem.problemType) {
      return NextResponse.json(
        { error: "考试类型与题目类型不一致" },
        { status: 400 },
      );
    }
    const examRecord = await prisma.examRecord.findUnique({
      where: {
        examId_userId: {
          examId,
          userId: auth.user.id,
        },
      },
    });

    if (!examRecord) {
      return NextResponse.json({ error: "请先开始考试" }, { status: 403 });
    }
    if (examRecord.status !== "in_progress") {
      return NextResponse.json(
        { error: "考试已经结束，不能继续提交" },
        { status: 403 },
      );
    }
    if (exam.status !== "published") {
      await finishExamRecord({
        examId,
        status: "expired",
        userId: auth.user.id,
      });
      return NextResponse.json(
        { error: "该考试未发布或已结束，不能提交" },
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
      await finishExamRecord({
        examId,
        status: "expired",
        userId: auth.user.id,
      });
      return NextResponse.json(
        { error: "考试已超时，不能继续提交" },
        { status: 403 },
      );
    }
  }

  if (problem.problemType === "objective") {
    const latestSubmission = await prisma.submission.findFirst({
      where: {
        examId,
        problemId,
        submissionType,
        userId: auth.user.id,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const remainingMs = latestSubmission
      ? objectiveSubmissionCooldownMs -
        (Date.now() - latestSubmission.createdAt.getTime())
      : 0;

    if (remainingMs > 0) {
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      return NextResponse.json(
        {
          error: `选择判断题 30 秒内只能提交一次，请 ${retryAfterSeconds} 秒后再提交`,
          retryAfterSeconds,
        },
        { status: 429 },
      );
    }
  }

  let result: JudgeResult;
  try {
    if (problem.problemType === "objective") {
      result = judgeObjectiveSubmission({
        answerText: code,
        items: objectiveItems,
      });
    } else {
      const judgeDefaults = await getJudgeDefaultSettings();
      result = await enqueueJudgeTask(() =>
        judgeCppCode({
          code,
          testCases: problem.testCases.map((item) => ({
            input: item.input,
            output: item.output,
          })),
          timeLimitMs: judgeDefaults.timeLimitMs,
          memoryLimitMb: judgeDefaults.memoryLimitMb,
        }),
      );
    }
  } catch (error) {
    if (
      error instanceof JudgeQueueFullError ||
      error instanceof JudgeQueueTimeoutError ||
      error instanceof JudgeInfrastructureError
    ) {
      const message =
        error instanceof JudgeInfrastructureError
          ? "评测服务暂时不可用，请稍后再试"
          : "评测队列繁忙，请稍后再试";
      return NextResponse.json(
        { error: message, retryAfterSeconds: JUDGE_RETRY_AFTER_SECONDS },
        {
          headers: {
            "Retry-After": String(JUDGE_RETRY_AFTER_SECONDS),
          },
          status: 503,
        },
      );
    }
    console.error("[JUDGE_SUBMISSION_ERROR]", {
      message: error instanceof Error ? error.message : "unknown",
      problemId,
      userId: auth.user.id,
    });
    return NextResponse.json(
      { error: "评测任务执行失败" },
      { status: 500 },
    );
  }

  const {
    countedForLearningAssignment,
    learningAssignmentDetached,
    submission,
  } = await prisma.$transaction(
    async (tx) => {
      const currentAssignmentProblem =
        learningAssignmentId !== null && assignmentProblemId !== null
          ? await tx.learningAssignmentProblem.findFirst({
              where: {
                id: assignmentProblemId,
                problemId,
                assignment: {
                  id: learningAssignmentId,
                  status: "active",
                  studentId: auth.user.id,
                },
              },
              select: { id: true },
            })
          : null;
      const effectiveAssignmentProblemId =
        currentAssignmentProblem?.id ?? null;
      const effectiveLearningAssignmentId =
        effectiveAssignmentProblemId === null ? null : learningAssignmentId;
      const detached =
        learningAssignmentId !== null &&
        effectiveLearningAssignmentId === null;
      const createdSubmission = await tx.submission.create({
        data: {
          createdAt: receivedAt,
          userId: auth.user.id,
          problemId,
          examId,
          learningAssignmentId: effectiveLearningAssignmentId,
          submissionType,
          code,
          language: problem.problemType === "objective" ? "Objective" : "C++17",
          status: result.status,
          passedCount: result.passedCount,
          totalCount: result.totalCount,
          runtimeMs: result.runtimeMs,
          errorMessage: result.errorMessage,
          caseResults: {
            create: result.caseResults.map((caseResult) => ({
              caseIndex: caseResult.caseIndex,
              status: caseResult.status,
              input: caseResult.input,
              expectedOutput: caseResult.expectedOutput,
              actualOutput: caseResult.actualOutput,
              runtimeMs: caseResult.runtimeMs,
              errorMessage: caseResult.errorMessage,
            })),
          },
        },
        include: {
          caseResults: { orderBy: { caseIndex: "asc" } },
        },
      });
      let counted = false;
      if (
        result.status === "Accepted" &&
        effectiveAssignmentProblemId !== null
      ) {
        const updated = await tx.learningAssignmentProblem.updateMany({
          where: { id: effectiveAssignmentProblemId, completedAt: null },
          data: { completedAt: receivedAt },
        });
        counted = updated.count === 1;
      }
      return {
        countedForLearningAssignment: counted,
        learningAssignmentDetached: detached,
        submission: createdSubmission,
      };
    },
  );

  if (examId !== null) {
    try {
      // A judge can finish after the exam timer has closed the record. Refresh
      // the frozen score so an on-time submission is counted exactly once.
      await refreshFinishedExamScore({
        examId,
        userId: auth.user.id,
      });
    } catch (error) {
      console.error("[EXAM_SCORE_REFRESH_ERROR]", {
        examId,
        message: error instanceof Error ? error.message : "unknown",
        userId: auth.user.id,
      });
    }
  }

  return NextResponse.json({
    countedForLearningAssignment,
    learningAssignmentDetached,
    submission: sanitizeSubmissionForStudent(submission),
    submissionId: submission.id,
  });
}
