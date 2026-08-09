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

  const existingExam = await prisma.exam.findFirst({
    where: getExamAccessWhere(auth.user, examId),
    select: { id: true, status: true },
  });
  if (!existingExam) {
    return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  }

  if (existingExam.status === "ended") {
    return NextResponse.json(
      { error: "已结束的考试不能重新改为草稿" },
      { status: 409 },
    );
  }

  const recordCount = await prisma.examRecord.count({ where: { examId } });
  if (recordCount > 0) {
    return NextResponse.json(
      { error: "已有学生考试记录，不能取消发布" },
      { status: 409 },
    );
  }

  const exam = await prisma.$transaction(async (tx) => {
    await clearExamProblemSnapshots(tx, examId);
    return tx.exam.update({
      where: { id: examId },
      data: { status: "draft" },
    });
  });

  return NextResponse.json({ exam });
}
