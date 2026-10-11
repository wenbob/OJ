// Shared server page for administrator and teacher shells.
import { PageHeading } from "@/components/PageHeading";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { ProblemListTable } from "@/components/ProblemListTable";
import { ProblemLibraryFilters } from "@/components/ProblemLibraryFilters";
import { FilterLink as CategoryLink } from "@/components/FilterChip";

import { Code2, ListChecks } from "lucide-react";


import { Pagination } from "@/components/Pagination";

import { buildProblemListWhere, problemLibraryHref, readProblemListFilters } from "@/lib/problemListFilters";
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
  getLatestAcceptedSubmissionIdsByProblem,
  getPracticeSubmissionCountsByProblem,
} from "@/lib/problemSubmissionCounts";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function StaffPracticePage({
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const query = await searchParams;
  const parsedFilters = readProblemListFilters(query);
  const problemType = parsedFilters.problemType ?? "programming";
  const filters = { ...parsedFilters, problemType };
  const normalizedCategory = filters.category;
  const libraryPath = `${basePath}/practice` as const;
  const { page, pageSize, skip } = readPaginationFromObject(
    query,
    PROBLEM_LIST_PAGE_SIZE,
  );
  const where = buildProblemListWhere(filters, user.id);
  const [problems, total, allCategories, allDifficulties] = await Promise.all([
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
    prisma.problem.groupBy({ by: ["difficulty"], where: { archivedAt: null, problemType }, orderBy: { difficulty: "asc" } }),
  ]);
  const problemIds = problems.map((problem) => problem.id);
  const [submissionCounts, latestAcceptedSubmissionIds] = await Promise.all([
    getPracticeSubmissionCountsByProblem({ problemIds }),
    getLatestAcceptedSubmissionIdsByProblem({
      problemIds,
      userId: user.id,
    }),
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
  const currentHref = problemLibraryHref(filters, { basePath: libraryPath, page, pageSize });
  const hasExtraFilters = Boolean(filters.q || filters.difficulty || filters.completion !== "all");
  const clearHref = problemLibraryHref({ ...filters, category: "", q: "", difficulty: "", completion: "all" }, { basePath: libraryPath, pageSize });

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="arena-kicker">
                {role === "admin" ? "Admin Practice" : "Teacher Practice"}
              </p>
              <PageHeading kind="practice" className="mt-2">题目练习</PageHeading>
              <p className="mt-2 text-sm font-semibold text-ink-600">
                {role === "admin" ? "管理员" : "老师"}可以在这里用同一套 Judge 流程测试题目。
              </p>
            </div>
            <p className="text-sm font-semibold text-ink-600">
              共 {total} 道题 · 当前 {problems.length} 道
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={problemType === "programming"}
              href={problemLibraryHref({ ...filters, problemType: "programming", category: "", difficulty: "" }, { basePath: libraryPath, pageSize })}
            >
              <Code2 aria-hidden="true" size={16} />编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href={problemLibraryHref({ ...filters, problemType: "objective", category: "", difficulty: "" }, { basePath: libraryPath, pageSize })}
            >
              <ListChecks aria-hidden="true" size={16} />选择判断题
            </CategoryLink>
          </div>
          <ProblemLibraryFilters key={currentHref} basePath={libraryPath} filters={filters} difficulties={allDifficulties.map((item) => item.difficulty).filter(Boolean)} pageSize={pageSize} />
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink active={!normalizedCategory} href={problemLibraryHref({ ...filters, category: "" }, { basePath: libraryPath, pageSize })}>全部</CategoryLink>
            {categories.map((category) => <CategoryLink active={normalizedCategory === category} href={problemLibraryHref({ ...filters, category }, { basePath: libraryPath, pageSize })} key={category}>{category}</CategoryLink>)}
          </div>
        </div>
        <ProblemListTable
          problems={problems}
          submissionCounts={submissionCounts}
          detailHrefBase={`${basePath}/practice/problems`}
          latestAcceptedSubmissionIds={latestAcceptedSubmissionIds}
          submissionHrefBase={`${basePath}/submissions`}
          returnTo={Object.keys(query).length ? currentHref : undefined}
          showProblemId
          emptyState={<AcademyEmptyState compact icon="practice" title={hasExtraFilters ? "没有找到符合条件的题目" : "当前分类下还没有题目"} description={hasExtraFilters ? "试试其他关键词，或放宽难度和通过状态条件。" : "试试其他分类，继续寻找适合的练习。"} href={clearHref} action={hasExtraFilters ? "清空筛选" : "查看全部分类"} />}
        />
        <Pagination
          basePath={`${basePath}/practice`}
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

export default function AdminPracticePage(props: PageProps) {
  return <StaffPracticePage {...props} role="admin" />;
}
