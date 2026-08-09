// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AcceptedProblemIndicator } from "@/components/AcceptedProblemIndicator";
import { AppShell } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
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
  getStaffNav,
  getStaffTitle,
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
    prisma.problem.findMany({
      where: { archivedAt: null, problemType },
      select: { category: true },
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
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
                {role === "admin" ? "Admin Practice" : "Teacher Practice"}
              </p>
              <h1 className="mt-2 text-2xl font-black">题目练习</h1>
              <p className="mt-2 text-sm font-semibold text-ink-600">
                {role === "admin" ? "管理员" : "老师"}可以在这里用同一套 Judge 流程测试题目。
              </p>
            </div>
            <p className="text-sm font-semibold text-ink-600">
              当前 {problems.length} 道题
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={problemType === "programming"}
              href={`${basePath}/practice?problemType=programming`}
            >
              编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href={`${basePath}/practice?problemType=objective`}
            >
              选择判断题
            </CategoryLink>
          </div>
          <CategoryFilter
            baseHref={`${basePath}/practice`}
            categories={categories}
            problemType={problemType}
            selectedCategory={normalizedCategory}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">标题</th>
                <th className="table-head px-5 py-3">难度</th>
                <th className="table-head px-5 py-3">分类</th>
                <th className="table-head px-5 py-3">题型</th>
                <th className="table-head px-5 py-3">提交</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => {
                const acceptedSubmissionId = latestAcceptedSubmissionIds.get(
                  problem.id,
                );
                return (
                  <tr
                    className={`border-b border-ink-950/10 transition-colors ${
                      acceptedSubmissionId
                        ? "bg-emerald-50/80 hover:bg-emerald-100/70"
                        : "problem-hover-incomplete"
                    }`}
                    key={problem.id}
                  >
                    <td className="px-5 py-4 font-black">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {problem.title}
                        {acceptedSubmissionId ? (
                          <AcceptedProblemIndicator
                            detailHrefBase={`${basePath}/submissions`}
                            problemTitle={problem.title}
                            problemType={problemType}
                            submissionId={acceptedSubmissionId}
                          />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {problem.difficulty}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {problem.category || "未分类"}
                    </td>
                    <td className="px-5 py-4">
                      <ProblemTypeBadge type={problem.problemType} />
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      <Link
                        className="font-black text-steel underline-offset-4 hover:text-clay hover:underline"
                        href={`${basePath}/submissions?problemId=${problem.id}`}
                        title={`查看《${problem.title}》的提交记录`}
                      >
                        {submissionCounts.get(problem.id) ?? 0}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-black text-steel hover:text-clay"
                        href={`${basePath}/practice/problems/${problem.id}`}
                      >
                        {acceptedSubmissionId ? "再次练习" : "进入做题"}
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {problems.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                    colSpan={6}
                  >
                    当前分类下还没有题目。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`${basePath}/practice`}
          page={pagination.page}
          pageSize={pagination.pageSize}
          searchParams={query}
          total={pagination.total}
          totalPages={pagination.totalPages}
        />
      </section>
    </AppShell>
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

function CategoryLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className={`border px-3 py-2 text-sm font-black ${
        active
          ? "border-ink-950 bg-ink-950 text-white"
          : "border-ink-950/10 bg-white/65 text-ink-800 hover:border-steel hover:text-steel"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}
