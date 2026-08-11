import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  buildPaginationMeta,
  readPaginationFromUrl,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { sanitizeSubmissionForStudent } from "@/lib/submissionVisibility";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { page, pageSize, skip } = readPaginationFromUrl(request.nextUrl.searchParams);
  const where = {
    userId: auth.user.id,
    submissionType: "exam",
  };
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        exam: { select: { id: true, title: true } },
        problem: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.submission.count({ where }),
  ]);
  const studentSubmissions = submissions.map((submission) =>
    sanitizeSubmissionForStudent(submission),
  );

  return NextResponse.json({
    items: studentSubmissions,
    submissions: studentSubmissions,
    ...buildPaginationMeta({ page, pageSize, total }),
  });
}
