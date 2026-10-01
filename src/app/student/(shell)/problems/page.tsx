import { PageHeading } from "@/components/PageHeading";
import { ProblemListTable } from "@/components/ProblemListTable";
import { FilterLink as CategoryLink } from "@/components/FilterChip";

import { Code2, ListChecks } from "lucide-react";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";

import { Pagination } from "@/components/Pagination";

import { requirePageUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  buildPaginationMeta,
  PROBLEM_LIST_PAGE_SIZE,
  readPaginationFromObject,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getOrderedProblemCategories,
  getProblemOrderBy,
} from "@/lib/problemOrdering";
import {
  getAcceptedProblemIds,
  getPracticeSubmissionCountsByProblem,
} from "@/lib/problemSubmissionCounts";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentProblemsPage({ searchParams }: PageProps) {
  const user = await requirePageUser("student");
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
  const { page, pageSize, skip } = readPaginationFromObject(
    query,
    PROBLEM_LIST_PAGE_SIZE,
  );
  const where = {
    archivedAt: null,
    problemType,
    ...(normalizedCategory ? { category: normalizedCategory } : {}),
  };

  const [problems, total, allCategories] = await Promise.all([
    prisma.problem.findMany({
      where,
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        problemType: true,
      },
      orderBy: getProblemOrderBy("custom"),
      skip,
      take: pageSize,
    }),
    prisma.problem.count({ where }),
    prisma.problem.groupBy({
      by: ["category"],
      where: { archivedAt: null, problemType },
    }),
  ]);
  const problemIds = problems.map((problem) => problem.id);
  const [submissionCounts, acceptedProblemIds] = await Promise.all([
    getPracticeSubmissionCountsByProblem({ problemIds, userId: user.id }),
    getAcceptedProblemIds({ problemIds, userId: user.id }),
  ]);

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
  const pagination = buildPaginationMeta({ page, pageSize, total });

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="arena-kicker">
                Daily Practice
              </p>
              <PageHeading kind="practice" className="mt-2 flex items-center gap-2">日常刷题</PageHeading>
            </div>
            <p className="text-sm font-semibold text-ink-600">
              共 {total} 道题 · 当前 {problems.length} 道
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={problemType === "programming"}
              href="/student/problems?problemType=programming"
            >
              <Code2 aria-hidden="true" size={16} />
              编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href="/student/problems?problemType=objective"
            >
              <ListChecks aria-hidden="true" size={16} />
              选择判断题
            </CategoryLink>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={!normalizedCategory}
              href={`/student/problems?problemType=${problemType}`}
            >
              全部
            </CategoryLink>
            {categories.map((category) => (
              <CategoryLink
                active={normalizedCategory === category}
                href={`/student/problems?problemType=${problemType}&category=${encodeURIComponent(category)}`}
                key={category}
              >
                {category}
              </CategoryLink>
            ))}
          </div>
        </div>
        <ProblemListTable
          problems={problems}
          submissionCounts={submissionCounts}
          detailHrefBase="/student/problems"
          acceptedProblemIds={acceptedProblemIds}
          emptyState={<AcademyEmptyState kind="practice" title="当前分类下还没有题目" description="试试其他分类，继续寻找适合今天的练习。" href={`/student/problems?problemType=${problemType}`} action="查看全部分类" />}
        />
        <Pagination
          basePath="/student/problems"
          page={pagination.page}
          pageSize={pagination.pageSize}
          searchParams={query}
          total={pagination.total}
          totalPages={pagination.totalPages}
        />
      </section>
    </>
  );
}
