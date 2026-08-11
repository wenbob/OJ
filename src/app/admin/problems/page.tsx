import {
  adminProblemSummarySelect,
  toAdminProblemSummary,
} from "@/lib/adminProblemSummary";
import { requirePageUser } from "@/lib/auth";
import {
  buildPaginationMeta,
  PROBLEM_LIST_PAGE_SIZE,
  readPaginationFromObject,
} from "@/lib/pagination";
import { isProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  getOrderedProblemCategories,
  getProblemOrderBy,
  getTitleSortedProblemPageIds,
  isTitleProblemListSort,
  normalizeProblemListSort,
  orderProblemsByIds,
  TITLE_SORT_PREVIEW_LIMIT,
} from "@/lib/problemOrdering";
import { getPracticeSubmissionCountsByProblem } from "@/lib/problemSubmissionCounts";
import { ProblemManager } from "./problem-manager";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProblemsPage({ searchParams }: PageProps) {
  await requirePageUser("admin");
  const query = await searchParams;
  const selectedCategory = Array.isArray(query.category)
    ? query.category[0]
    : query.category;
  const normalizedCategory = selectedCategory?.trim() || "";
  const selectedProblemType = Array.isArray(query.problemType)
    ? query.problemType[0]
    : query.problemType;
  const problemType = isProblemType(selectedProblemType)
    ? selectedProblemType
    : "programming";
  const createValue = Array.isArray(query.create) ? query.create[0] : query.create;
  const sortValue = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const listSort = normalizeProblemListSort(sortValue);
  const { page, pageSize, skip } = readPaginationFromObject(
    query,
    PROBLEM_LIST_PAGE_SIZE,
  );
  const where = {
    archivedAt: null,
    problemType,
    ...(normalizedCategory ? { category: normalizedCategory } : {}),
  };
  const [total, allCategories, titleRows] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.groupBy({
      by: ["category"],
      where: { archivedAt: null, problemType },
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

  const initialProblems = problems.map((problem, index) => ({
    ...toAdminProblemSummary(problem),
    submissions: submissionCounts.get(problem.id) ?? 0,
    sortPosition: skip + index + 1,
    canMoveUp: skip + index > 0,
    canMoveDown: skip + index + 1 < total,
  }));

  const categoryNames = Array.from(
    new Set(
      allCategories
        .map((problem) => problem.category?.trim() || "未分类")
        .filter(Boolean),
    ),
  );
  const categories = await getOrderedProblemCategories(
    prisma,
    problemType,
    categoryNames,
  );

  return (
    <>
      <ProblemManager
        categories={categories}
        initialCategory={normalizedCategory}
        initialPagination={buildPaginationMeta({ page, pageSize, total })}
        initialProblemType={problemType}
        initialProblems={initialProblems}
        initialSort={listSort}
        key={`${problemType}:${normalizedCategory}:${listSort}:${page}:${pageSize}:${createValue === "1" ? "create" : "list"}`}
        openCreateForm={createValue === "1"}
      />
    </>
  );
}
