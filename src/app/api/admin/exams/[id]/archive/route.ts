import { NextRequest, NextResponse } from "next/server";
import { ExamLifecycleError, setExamArchived } from "@/lib/examLifecycle";
import { requireStaffApiUser } from "@/lib/staffAccess";

type RouteContext = { params: Promise<{ id: string }> };

async function changeArchive(request: NextRequest, context: RouteContext, archived: boolean) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  const examId = Number((await context.params).id);
  if (!Number.isInteger(examId) || examId <= 0) return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  try {
    const exam = await setExamArchived(auth.user, examId, archived);
    return NextResponse.json({ exam });
  } catch (error) {
    if (error instanceof ExamLifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[EXAM_ARCHIVE_ERROR]", { examId, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "归档状态更新失败，请稍后重试" }, { status: 500 });
  }
}

export const POST = (request: NextRequest, context: RouteContext) => changeArchive(request, context, true);
export const DELETE = (request: NextRequest, context: RouteContext) => changeArchive(request, context, false);
