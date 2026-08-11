import Link from "next/link";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import { formatDate, formatRuntime } from "@/lib/format";
import {
  buildPaginationMeta,
  readPaginationFromObject,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentSubmissionsPage({ searchParams }: PageProps) {
  const user = await requirePageUser("student");
  const query = await searchParams;
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = { userId: user.id, submissionType: "practice" };
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        problem: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.submission.count({ where }),
  ]);
  const pagination = buildPaginationMeta({ page, pageSize, total });

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-950/10 p-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Daily Submissions
            </p>
            <h1 className="mt-2 text-2xl font-black">日常刷题提交记录</h1>
          </div>
          <Link className="btn btn-secondary" href="/student/exam-submissions">
            查看考试提交
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
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
                  <td className="px-5 py-4 font-black">
                    <Link
                      className="hover:text-steel"
                      href={`/student/problems/${submission.problem.id}`}
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
                        endpoint={`/api/submissions/${submission.id}`}
                      />
                      <Link
                        className="btn btn-primary px-3 py-2 text-sm"
                        href={`/student/problems/${submission.problem.id}?fromSubmission=${submission.id}`}
                      >
                        继续修改
                      </Link>
                      <Link
                        className="btn btn-secondary px-3 py-2 text-sm"
                        href={`/student/submissions/${submission.id}`}
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
                    colSpan={6}
                  >
                    还没有日常刷题提交。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath="/student/submissions"
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
