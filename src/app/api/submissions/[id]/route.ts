import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeSubmissionForStudent } from "@/lib/submissionVisibility";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) {
    return NextResponse.json({ error: "提交 ID 不合法" }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, userId: auth.user.id },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, title: true } },
      exam: { select: { id: true, title: true } },
      caseResults: { orderBy: { caseIndex: "asc" } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "提交记录不存在或无权查看" }, { status: 404 });
  }

  return NextResponse.json({ submission: sanitizeSubmissionForStudent(submission) });
}
