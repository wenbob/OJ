import { NextRequest, NextResponse } from "next/server";
import {
  getObjectiveTotalScore,
  parseObjectiveItems,
  validateObjectiveItems,
} from "@/lib/objectiveProblem";
import { snapshotExamProblems } from "@/lib/examSnapshot";
import { prisma } from "@/lib/prisma";
import {
  getExamAccessWhere,
  requireStaffApiUser,
} from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  try {
    const exam = await prisma.$transaction(async (tx) => {
      const existingExam = await tx.exam.findFirst({
        where: getExamAccessWhere(auth.user, examId),
        include: {
          problems: {
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
          },
        },
      });
      if (!existingExam) throw new ExamPublishError(404, "考试不存在");
      if (existingExam.status !== "draft") {
        throw new ExamPublishError(
          409,
          existingExam.status === "ended"
            ? "已结束的考试不能重新发布"
            : "考试已经发布",
        );
      }
      if (!existingExam.title.trim()) {
        throw new ExamPublishError(400, "考试标题不能为空");
      }
      if (!existingExam.durationMin || existingExam.durationMin <= 0) {
        throw new ExamPublishError(400, "考试时长必须大于 0 分钟");
      }
      if (existingExam.problems.length === 0) {
        throw new ExamPublishError(400, "考试至少需要添加 1 道题后才能发布");
      }
      const mismatchedProblem = existingExam.problems.find(
        (item) => item.problem.problemType !== existingExam.examType,
      );
      if (mismatchedProblem) {
        throw new ExamPublishError(
          400,
          `题目《${mismatchedProblem.problem.title}》与考试类型不一致`,
        );
      }
      const archivedProblem = existingExam.problems.find(
        (item) => item.problem.archivedAt !== null,
      );
      if (archivedProblem) {
        throw new ExamPublishError(
          400,
          `题目《${archivedProblem.problem.title}》已经下架，请先从考试中移除`,
        );
      }
      const invalidProblem = existingExam.problems.find(
        (item) => item.score <= 0,
      );
      if (invalidProblem) {
        throw new ExamPublishError(
          400,
          `题目《${invalidProblem.problem.title}》的分值必须大于 0`,
        );
      }
      if (existingExam.examType === "objective") {
        const invalidObjectiveProblem = existingExam.problems.find((item) => {
          const objectiveItems = parseObjectiveItems(item.problem.objectiveItems);
          return (
            validateObjectiveItems(objectiveItems).length > 0 ||
            item.score !== getObjectiveTotalScore(objectiveItems)
          );
        });
        if (invalidObjectiveProblem) {
          throw new ExamPublishError(
            400,
            `客观题《${invalidObjectiveProblem.problem.title}》的小题分值配置无效`,
          );
        }
      }

      await snapshotExamProblems(tx, examId);
      const updated = await tx.exam.updateMany({
        where: { id: examId, status: "draft" },
        data: { status: "published" },
      });
      if (updated.count !== 1) {
        throw new ExamPublishError(409, "考试状态已变化，请刷新后重试");
      }
      return tx.exam.findUniqueOrThrow({ where: { id: examId } });
    });
    return NextResponse.json({ exam });
  } catch (error) {
    if (error instanceof ExamPublishError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[EXAM_PUBLISH_ERROR]", {
      examId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "发布考试失败" }, { status: 500 });
  }
}

class ExamPublishError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
