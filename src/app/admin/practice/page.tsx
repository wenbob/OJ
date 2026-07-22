import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { requirePageUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  buildPaginationMeta,
  readPaginationFromObject,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getOrderedProblemCategories,
  getProblemOrderBy,
} from "@/lib/problemOrdering";
import { getPracticeSubmissionCountsByProblem } from "@/lib/problemSubmissionCounts";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPracticePage({ searchParams }: PageProps) {
  const user = await requirePageUser("admin");
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
  const { page, pageSize, skip } = readPaginationFromObject(query);
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
  const submissionCounts = await getPracticeSubmissionCountsByProblem({
    problemIds: problems.map((problem) => problem.id),
  });

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
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
                Admin Practice
              </p>
              <h1 className="mt-2 text-2xl font-black">题目练习</h1>
              <p className="mt-2 text-sm font-semibold text-ink-600">
                管理员可以在这里用同一套 Judge 流程测试题目。
              </p>
            </div>
            <p className="text-sm font-semibold text-ink-600">
              当前 {problems.length} 道题
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <CategoryLink
              active={problemType === "programming"}
              href="/admin/practice?problemType=programming"
            >
              编程题
            </CategoryLink>
            <CategoryLink
              active={problemType === "objective"}
              href="/admin/practice?problemType=objective"
            >
              选择判断题
            </CategoryLink>
          </div>
          <CategoryFilter
            baseHref="/admin/practice"
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
              {problems.map((problem) => (
                <tr className="border-b border-ink-950/10" key={problem.id}>
                  <td className="px-5 py-4 font-black">{problem.title}</td>
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
                      href={`/admin/submissions?problemId=${problem.id}`}
                      title={`查看《${problem.title}》的提交记录`}
                    >
                      {submissionCounts.get(problem.id) ?? 0}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      className="inline-flex items-center gap-1 text-sm font-black text-steel hover:text-clay"
                      href={`/admin/practice/problems/${problem.id}`}
                    >
                      进入做题
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
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
          basePath="/admin/practice"
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
