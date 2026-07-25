import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getStaffSubmissionWhere,
  requireStaffApiUser,
} from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) {
    return NextResponse.json({ error: "提交 ID 不合法" }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: {
      AND: [{ id: submissionId }, getStaffSubmissionWhere(auth.user)],
    },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, title: true } },
      exam: { select: { id: true, title: true } },
      caseResults: { orderBy: { caseIndex: "asc" } },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  }

  return NextResponse.json({ submission });
}
