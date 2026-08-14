import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { expireExamRecordIfNeeded } from "@/lib/examScoring";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const examRecord = await expireExamRecordIfNeeded({
    examId,
    userId: auth.user.id,
  });
  if (!examRecord) {
    return NextResponse.json({ error: "考试记录不存在" }, { status: 404 });
  }

  const safeExamRecord = { ...examRecord } as typeof examRecord & {
    exam?: unknown;
  };
  delete safeExamRecord.exam;
  if (safeExamRecord.status === "in_progress") {
    return NextResponse.json(
      {
        error: "考试尚未到截止时间，不能提前结束",
        examRecord: safeExamRecord,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    examRecord: safeExamRecord,
    resultHref: `/student/exams/${examId}/result`,
  });
}
