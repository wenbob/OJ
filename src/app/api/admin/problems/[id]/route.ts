import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  getObjectiveTotalScore,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { normalizeProblemPayload } from "@/lib/problemPayload";
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
      const examLinks = await tx.examProblem.findMany({
        where: { problemId },
        include: {
          exam: {
            select: {
              title: true,
              examType: true,
            },
          },
        },
      });
      const incompatibleExam = examLinks.find(
        (link) => link.exam.examType !== payload.problemType,
      );
      if (incompatibleExam) {
        throw new Error(
          `题目已加入考试《${incompatibleExam.exam.title}》，请先从该考试移除后再修改题型`,
        );
      }

      await tx.testCase.deleteMany({ where: { problemId } });
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
          objectiveItems: payload.objectiveItems ?? null,
          testCases:
            payload.problemType === "programming"
              ? { create: payload.testCases }
              : undefined,
        },
        include: { testCases: true },
      });
      if (payload.problemType === "objective") {
        await tx.examProblem.updateMany({
          where: { problemId },
          data: {
            score: getObjectiveTotalScore(
              parseObjectiveItems(payload.objectiveItems),
            ),
          },
        });
      }
      return updatedProblem;
    });

    return NextResponse.json({ problem });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新题目失败" },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
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

  await prisma.problem.delete({ where: { id: problemId } });
  return NextResponse.json({ ok: true });
}
