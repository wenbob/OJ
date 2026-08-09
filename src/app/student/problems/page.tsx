import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
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

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

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
    prisma.problem.findMany({
      where: { archivedAt: null, problemType },
      select: { category: true },
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
    <AppShell nav={studentNav} title="学生端" user={user}>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
                Daily Practice
              </p>
              <h1 className="mt-2 text-2xl font-black">日常刷题</h1>
            </div>
            <p className="text-sm font-semibold text-ink-600">
              当前 {problems.length} 道题
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={problemType === "programming"}
              href="/student/problems?problemType=programming"
            >
              编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href="/student/problems?problemType=objective"
            >
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">标题</th>
                <th className="table-head px-5 py-3">难度</th>
                <th className="table-head px-5 py-3">分类</th>
                <th className="table-head px-5 py-3">题型</th>
                <th className="table-head px-5 py-3">我的提交</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => {
                const isAccepted = acceptedProblemIds.has(problem.id);
                return (
                  <tr
                    className={`border-b border-ink-950/10 transition-colors ${
                      isAccepted
                        ? "bg-emerald-50/80 hover:bg-emerald-100/70"
                        : "problem-hover-incomplete"
                    }`}
                    key={problem.id}
                  >
                    <td className="px-5 py-4 font-black">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {problem.title}
                        {isAccepted ? (
                          <span className="border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800">
                            已通过
                          </span>
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
                      {submissionCounts.get(problem.id) ?? 0}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-black text-steel hover:text-clay"
                        href={`/student/problems/${problem.id}`}
                      >
                        {isAccepted ? "再次练习" : "开始做题"}
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
          basePath="/student/problems"
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
