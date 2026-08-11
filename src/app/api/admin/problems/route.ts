import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  adminProblemSummarySelect,
  toAdminProblemSummary,
} from "@/lib/adminProblemSummary";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  buildPaginationMeta,
  PROBLEM_LIST_PAGE_SIZE,
  readPaginationFromUrl,
} from "@/lib/pagination";
import { normalizeProblemPayload } from "@/lib/problemPayload";
import {
  getNextProblemSortOrder,
  getOrderedProblemCategories,
  getProblemOrderBy,
  getTitleSortedProblemPageIds,
  isTitleProblemListSort,
  normalizeProblemListSort,
  orderProblemsByIds,
  TITLE_SORT_PREVIEW_LIMIT,
} from "@/lib/problemOrdering";
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
  const listSort = normalizeProblemListSort(
    request.nextUrl.searchParams.get("sort"),
  );
  const { page, pageSize, skip } = readPaginationFromUrl(
    request.nextUrl.searchParams,
    PROBLEM_LIST_PAGE_SIZE,
  );
  const where = {
    archivedAt: null,
    ...(category ? { category } : {}),
    ...(problemType ? { problemType } : {}),
  };
  const [total, categoryRows, titleRows] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.groupBy({
      by: ["category"],
      where: {
        archivedAt: null,
        ...(problemType ? { problemType } : {}),
      },
    }),
    isTitleProblemListSort(listSort)
      ? prisma.problem.findMany({
          where,
          select: { id: true, title: true },
          take: TITLE_SORT_PREVIEW_LIMIT + 1,
        })
      : Promise.resolve([]),
  ]);
  const problems = await (async () => {
    if (isTitleProblemListSort(listSort)) {
      if (titleRows.length > TITLE_SORT_PREVIEW_LIMIT) {
        return prisma.problem.findMany({
          where,
          select: adminProblemSummarySelect,
          orderBy: getProblemOrderBy(listSort),
          skip,
          take: pageSize,
        });
      }
      const orderedIds = getTitleSortedProblemPageIds(
        titleRows,
        listSort,
        skip,
        pageSize,
      );
      const pageProblems = await prisma.problem.findMany({
        where: { ...where, id: { in: orderedIds } },
        select: adminProblemSummarySelect,
      });
      return orderProblemsByIds(pageProblems, orderedIds);
    }
    return prisma.problem.findMany({
      where,
      select: adminProblemSummarySelect,
      orderBy: getProblemOrderBy(listSort),
      skip,
      take: pageSize,
    });
  })();
  const submissionCounts = await getPracticeSubmissionCountsByProblem({
    problemIds: problems.map((problem) => problem.id),
  });
  const items = problems.map((problem, index) => ({
    ...toAdminProblemSummary(problem),
    submissions: submissionCounts.get(problem.id) ?? 0,
    sortPosition: skip + index + 1,
    canMoveUp: skip + index > 0,
    canMoveDown: skip + index + 1 < total,
  }));

  const categoryNames = Array.from(
    new Set(
      categoryRows
        .map((problem) => problem.category?.trim() || "未分类")
        .filter(Boolean),
    ),
  );
  const categories = problemType && isProblemType(problemType)
    ? await getOrderedProblemCategories(prisma, problemType, categoryNames)
    : categoryNames;

  return NextResponse.json({
    items,
    problems: items,
    categories,
    sort: listSort,
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
    const problem = await prisma.$transaction(async (tx) => {
      const sortOrder = await getNextProblemSortOrder(tx, payload.problemType);
      return tx.problem.create({
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
          sortOrder,
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
    });

    return NextResponse.json({ problem }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建题目失败" },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
}
