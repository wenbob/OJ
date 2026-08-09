import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  getObjectiveTotalScore,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { normalizeProblemPayload } from "@/lib/problemPayload";
import { getNextProblemSortOrder } from "@/lib/problemOrdering";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(id: string) {
  const problemId = Number(id);
  return Number.isInteger(problemId) ? problemId : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = parseId(id);
  if (!problemId) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      archivedAt: true,
      category: true,
      dataRange: true,
      description: true,
      difficulty: true,
      id: true,
      inputDescription: true,
      objectiveItems: true,
      outputDescription: true,
      problemType: true,
      sampleInput: true,
      sampleOutput: true,
      testCases: {
        orderBy: { id: "asc" },
        select: { id: true, input: true, isSample: true, output: true },
      },
      title: true,
    },
  });
  if (!problem || problem.archivedAt) {
    return NextResponse.json(
      { error: "题目不存在或已经下架" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    problem: {
      category: problem.category,
      dataRange: problem.dataRange,
      description: problem.description,
      difficulty: problem.difficulty,
      id: problem.id,
      inputDescription: problem.inputDescription,
      objectiveItems: problem.objectiveItems,
      outputDescription: problem.outputDescription,
      problemType: problem.problemType,
      sampleInput: problem.sampleInput,
      sampleOutput: problem.sampleOutput,
      testCases: problem.testCases,
      title: problem.title,
    },
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = parseId(id);
  if (!problemId) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  try {
    const payload = normalizeProblemPayload(
      await readJsonWithLimit(request, REQUEST_LIMITS.problemPayloadJsonBytes),
    );
    const problem = await prisma.$transaction(async (tx) => {
      const currentProblem = await tx.problem.findUnique({
        where: { id: problemId },
        select: { archivedAt: true, problemType: true },
      });
      if (!currentProblem || currentProblem.archivedAt) {
        throw new Error("题目不存在或已经下架");
      }
      const examLinks = await tx.examProblem.findMany({
        where: { problemId },
        include: {
          exam: {
            select: {
              status: true,
              title: true,
              examType: true,
            },
          },
        },
      });
      const publishedExam = examLinks.find(
        (link) => link.exam.status === "published",
      );
      if (publishedExam) {
        throw new PublishedExamProblemError(
          `题目正在已发布考试《${publishedExam.exam.title}》中，请先取消发布`,
        );
      }
      const incompatibleExam = examLinks.find(
        (link) => link.exam.examType !== payload.problemType,
      );
      if (incompatibleExam) {
        throw new Error(
          `题目已加入考试《${incompatibleExam.exam.title}》，请先从该考试移除后再修改题型`,
        );
      }

      await tx.testCase.deleteMany({ where: { problemId } });
      const sortOrder =
        currentProblem.problemType === payload.problemType
          ? undefined
          : await getNextProblemSortOrder(tx, payload.problemType);
      const updatedProblem = await tx.problem.update({
        where: { id: problemId },
        data: {
          title: payload.title,
          description: payload.description,
          inputDescription: payload.inputDescription,
          outputDescription: payload.outputDescription,
          sampleInput: payload.sampleInput,
          sampleOutput: payload.sampleOutput,
          dataRange: payload.dataRange,
          difficulty: payload.difficulty,
          category: payload.category,
          problemType: payload.problemType,
          sortOrder,
          objectiveItems: payload.objectiveItems ?? null,
          testCases:
            payload.problemType === "programming"
              ? { create: payload.testCases }
              : undefined,
        },
        include: { testCases: true },
      });
      if (payload.problemType === "objective") {
        await tx.objectiveAiExplanation.deleteMany({
          where: {
            itemIndex: {
              gt: parseObjectiveItems(payload.objectiveItems).length,
            },
            problemId,
          },
        });
        await tx.examProblem.updateMany({
          where: { problemId },
          data: {
            score: getObjectiveTotalScore(
              parseObjectiveItems(payload.objectiveItems),
            ),
          },
        });
      } else {
        await tx.objectiveAiExplanation.deleteMany({ where: { problemId } });
      }
      return updatedProblem;
    });

    return NextResponse.json({ problem });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新题目失败" },
      {
        status:
          error instanceof PayloadTooLargeError
            ? 413
            : error instanceof PublishedExamProblemError
              ? 409
              : 400,
      },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = parseId(id);
  if (!problemId) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  const activeAssignmentCount = await prisma.learningAssignmentProblem.count({
    where: {
      completedAt: null,
      problemId,
      assignment: { status: "active" },
    },
  });
  if (activeAssignmentCount > 0) {
    return NextResponse.json(
      { error: "该题正在学生未完成的专项练习中，请先归档相关任务" },
      { status: 409 },
    );
  }

  const publishedExam = await prisma.examProblem.findFirst({
    where: { problemId, exam: { status: "published" } },
    select: { exam: { select: { title: true } } },
  });
  if (publishedExam) {
    return NextResponse.json(
      { error: `该题正在已发布考试《${publishedExam.exam.title}》中，请先取消发布` },
      { status: 409 },
    );
  }

  const archivedAt = new Date();
  const result = await prisma.problem.updateMany({
    where: { archivedAt: null, id: problemId },
    data: { archivedAt },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "题目不存在或已经下架" }, { status: 404 });
  }
  return NextResponse.json({ archivedAt, archivedCount: 1, ok: true });
}

class PublishedExamProblemError extends Error {}
