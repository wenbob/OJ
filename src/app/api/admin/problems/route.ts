import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  buildPaginationMeta,
  readPaginationFromUrl,
} from "@/lib/pagination";
import { normalizeProblemPayload } from "@/lib/problemPayload";
import { prisma } from "@/lib/prisma";
import { getPracticeSubmissionCountsByProblem } from "@/lib/problemSubmissionCounts";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const category = request.nextUrl.searchParams.get("category")?.trim();
  const problemType = request.nextUrl.searchParams.get("problemType")?.trim();
  if (problemType && !isProblemType(problemType)) {
    return NextResponse.json({ error: "题型不合法" }, { status: 400 });
  }
  const { page, pageSize, skip } = readPaginationFromUrl(request.nextUrl.searchParams);
  const where = {
    ...(category ? { category } : {}),
    ...(problemType ? { problemType } : {}),
  };
  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        testCases: { orderBy: { id: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.problem.count({ where: Object.keys(where).length ? where : undefined }),
  ]);
  const submissionCounts = await getPracticeSubmissionCountsByProblem({
    problemIds: problems.map((problem) => problem.id),
  });
  const items = problems.map((problem) => ({
    ...problem,
    submissions: submissionCounts.get(problem.id) ?? 0,
  }));

  return NextResponse.json({
    items,
    problems: items,
    ...buildPaginationMeta({ page, pageSize, total }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const payload = normalizeProblemPayload(
      await readJsonWithLimit(request, REQUEST_LIMITS.problemPayloadJsonBytes),
    );
    const problem = await prisma.problem.create({
      data: {
        title: payload.title,
        description: payload.description,
        inputDescription: payload.inputDescription,
        outputDescription: payload.outputDescription,
        sampleInput: payload.sampleInput,
        sampleOutput: payload.sampleOutput,
        dataRange: payload.dataRange,
        difficulty: payload.difficulty,
        category: payload.category,
        problemType: payload.problemType,
        objectiveItems: payload.objectiveItems ?? null,
        testCases:
          payload.problemType === "programming"
            ? {
                create: payload.testCases,
              }
            : undefined,
      },
      include: { testCases: true },
    });

    return NextResponse.json({ problem }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建题目失败" },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
}
