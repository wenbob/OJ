// Shared server page for administrator and teacher shells.
import { PageHeading } from "@/components/PageHeading";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { ProblemListTable } from "@/components/ProblemListTable";
import { FilterLink as CategoryLink } from "@/components/FilterChip";

import { Code2, ListChecks } from "lucide-react";


import { Pagination } from "@/components/Pagination";

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
              href={`${basePath}/practice?problemType=programming`}
            >
              <Code2 aria-hidden="true" size={16} />编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href={`${basePath}/practice?problemType=objective`}
            >
              <ListChecks aria-hidden="true" size={16} />选择判断题
            </CategoryLink>
          </div>
          <CategoryFilter
            baseHref={`${basePath}/practice`}
            categories={categories}
            problemType={problemType}
            selectedCategory={normalizedCategory}
          />
        </div>
        <ProblemListTable
          problems={problems}
          submissionCounts={submissionCounts}
          detailHrefBase={`${basePath}/practice/problems`}
          latestAcceptedSubmissionIds={latestAcceptedSubmissionIds}
          submissionHrefBase={`${basePath}/submissions`}
          emptyState={<AcademyEmptyState compact icon="practice" title="当前分类下还没有题目" description="试试其他分类，继续寻找适合的练习。" href={`${basePath}/practice?problemType=${problemType}`} action="查看全部分类" />}
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

function CategoryFilter({
  baseHref,
  categories,
  problemType,
  selectedCategory,
}: {
  baseHref: string;
  categories: string[];
  problemType: "programming" | "objective";
  selectedCategory: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <CategoryLink
        active={!selectedCategory}
        href={`${baseHref}?problemType=${problemType}`}
      >
        全部
      </CategoryLink>
      {categories.map((category) => (
        <CategoryLink
          active={selectedCategory === category}
          href={`${baseHref}?problemType=${problemType}&category=${encodeURIComponent(category)}`}
          key={category}
        >
          {category}
        </CategoryLink>
      ))}
    </div>
  );
}
