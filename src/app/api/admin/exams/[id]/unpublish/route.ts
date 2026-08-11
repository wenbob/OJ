import { NextRequest, NextResponse } from "next/server";
import { clearExamProblemSnapshots } from "@/lib/examSnapshot";
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
        select: { id: true, status: true },
      });
      if (!existingExam) throw new ExamUnpublishError(404, "考试不存在");
      if (existingExam.status === "ended") {
        throw new ExamUnpublishError(409, "已结束的考试不能重新改为草稿");
      }
      const recordCount = await tx.examRecord.count({ where: { examId } });
      if (recordCount > 0) {
        throw new ExamUnpublishError(409, "已有学生考试记录，不能取消发布");
      }
      await clearExamProblemSnapshots(tx, examId);
      const updated = await tx.exam.updateMany({
        where: { id: examId, status: { not: "ended" } },
        data: { status: "draft" },
      });
      if (updated.count !== 1) {
        throw new ExamUnpublishError(409, "考试状态已变化，请刷新后重试");
      }
      return tx.exam.findUniqueOrThrow({ where: { id: examId } });
    });
    return NextResponse.json({ exam });
  } catch (error) {
    if (error instanceof ExamUnpublishError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[EXAM_UNPUBLISH_ERROR]", {
      examId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "取消发布失败" }, { status: 500 });
  }
}

class ExamUnpublishError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
