import { NextRequest, NextResponse } from "next/server";
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
    select: { id: true },
  });
  if (!existingExam) {
    return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  }

  const exam = await prisma.exam.update({
    where: { id: examId },
    data: { status: "draft" },
  });

  return NextResponse.json({ exam });
}
