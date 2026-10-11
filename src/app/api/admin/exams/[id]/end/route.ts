import { NextRequest, NextResponse } from "next/server";
import { endExam, ExamLifecycleError } from "@/lib/examLifecycle";
import { requireStaffApiUser } from "@/lib/staffAccess";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  const examId = Number((await context.params).id);
  if (!Number.isInteger(examId) || examId <= 0) return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  try {
    return NextResponse.json({ exam: await endExam(auth.user, examId) });
  } catch (error) {
    if (error instanceof ExamLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[EXAM_END_ERROR]", { examId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "结束考试或成绩结算失败，请刷新后重试" }, { status: 500 });
  }
}
