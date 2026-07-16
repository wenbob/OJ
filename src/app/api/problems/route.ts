import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  buildPaginationMeta,
  readPaginationFromUrl,
} from "@/lib/pagination";
import { isProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getPracticeSubmissionCountsByProblem } from "@/lib/problemSubmissionCounts";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const category = request.nextUrl.searchParams.get("category")?.trim();
  const problemTypeValue = request.nextUrl.searchParams.get("problemType")?.trim();
  if (problemTypeValue && !isProblemType(problemTypeValue)) {
    return NextResponse.json({ error: "题型不合法" }, { status: 400 });
  }
  const { page, pageSize, skip } = readPaginationFromUrl(request.nextUrl.searchParams);
  const where = {
    archivedAt: null,
    ...(category ? { category } : {}),
    ...(problemTypeValue ? { problemType: problemTypeValue } : {}),
  };
  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        problemType: true,
        createdAt: true,
      },
    }),
    prisma.problem.count({ where }),
  ]);
  const submissionCounts = await getPracticeSubmissionCountsByProblem({
    problemIds: problems.map((problem) => problem.id),
    userId: auth.user?.id,
  });
  const items = problems.map((problem) => ({
    ...problem,
    mySubmissionCount: submissionCounts.get(problem.id) ?? 0,
  }));

  return NextResponse.json({
    items,
    problems: items,
    ...buildPaginationMeta({ page, pageSize, total }),
  });
}
