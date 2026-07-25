// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import {
  buildAdminSubmissionWhere,
  readAdminSubmissionFiltersFromObject,
} from "@/lib/adminSubmissionFilters";
import { formatDate, formatRuntime } from "@/lib/format";
import {
  buildPaginationMeta,
  readPaginationFromObject,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getStaffBasePath,
  getStaffNav,
  getStaffSubmissionWhere,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = [
  "Accepted",
  "Wrong Answer",
  "Compile Error",
  "Runtime Error",
  "Time Limit Exceeded",
];

export async function StaffSubmissionsPage({
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const query = await searchParams;
  const filters = readAdminSubmissionFiltersFromObject(query);
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = {
    AND: [
      buildAdminSubmissionWhere(filters),
      getStaffSubmissionWhere(user),
    ],
    submissionType: "practice",
  };
  const [submissions, total, problems] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, role: true } },
        problem: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.submission.count({ where }),
    prisma.problem.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);
  const pagination = buildPaginationMeta({ page, pageSize, total });

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <section className="surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Daily Submissions
            </p>
            <h1 className="mt-2 text-2xl font-black">日常刷题提交记录</h1>
          </div>
          <Link className="btn btn-secondary" href={`${basePath}/exam-submissions`}>
            查看考试提交
          </Link>
        </div>
        <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6" method="GET">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            用户名
            <input
              className="field"
              defaultValue={filters.username ?? ""}
              name="username"
              placeholder="模糊搜索"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            角色
            <select className="field" defaultValue={filters.role ?? ""} name="role">
              <option value="">全部角色</option>
              <option value="student">student</option>
              {role === "teacher" ? (
                <option value="teacher">teacher（本人）</option>
              ) : (
                <>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </>
              )}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            题目
            <select
              className="field"
              defaultValue={filters.problemId?.toString() ?? ""}
              name="problemId"
            >
              <option value="">全部题目</option>
              {problems.map((problem) => (
                <option key={problem.id} value={problem.id}>
                  {problem.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            状态
            <select className="field" defaultValue={filters.status ?? ""} name="status">
              <option value="">全部状态</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            开始日期
            <input
              className="field"
              defaultValue={filters.startDate ?? ""}
              name="startDate"
              type="date"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            结束日期
            <input
              className="field"
              defaultValue={filters.endDate ?? ""}
              name="endDate"
              type="date"
            />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
            <button className="btn btn-primary" type="submit">
              筛选
            </button>
            <Link className="btn btn-secondary" href={`${basePath}/submissions`}>
              重置
            </Link>
          </div>
        </form>
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <h2 className="text-xl font-black">记录列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">ID</th>
                <th className="table-head px-5 py-3">用户名</th>
                <th className="table-head px-5 py-3">角色</th>
                <th className="table-head px-5 py-3">题目</th>
                <th className="table-head px-5 py-3">状态</th>
                <th className="table-head px-5 py-3">测试点</th>
                <th className="table-head px-5 py-3">运行时间</th>
                <th className="table-head px-5 py-3">提交时间</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr className="border-b border-ink-950/10" key={submission.id}>
                  <td className="px-5 py-4 text-sm font-black">{submission.id}</td>
                  <td className="px-5 py-4 font-black">{submission.user.username}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {submission.user.role}
                  </td>
                  <td className="px-5 py-4 font-black">
                    <Link
                      className="hover:text-steel"
                      href={`${basePath}/practice/problems/${submission.problem.id}`}
                    >
                      {submission.problem.title}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={submission.status} />
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {submission.passedCount}/{submission.totalCount}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {formatRuntime(submission.runtimeMs)}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {formatDate(submission.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <CopyCodeButton
                        endpoint={`/api/admin/submissions/${submission.id}`}
                      />
                      <Link
                        className="btn btn-secondary px-3 py-2 text-sm"
                        href={`${basePath}/submissions/${submission.id}`}
                      >
                        查看详情
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {submissions.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                    colSpan={9}
                  >
                    没有符合条件的日常提交。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`${basePath}/submissions`}
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

export default function AdminSubmissionsPage(props: PageProps) {
  return <StaffSubmissionsPage {...props} role="admin" />;
}
