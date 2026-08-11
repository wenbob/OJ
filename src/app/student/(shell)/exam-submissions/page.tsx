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

export default async function StudentExamSubmissionsPage({
  searchParams,
}: PageProps) {
  const user = await requirePageUser("student");
  const query = await searchParams;
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = { userId: user.id, submissionType: "exam" };
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            records: {
              where: { userId: user.id },
              select: { status: true },
              take: 1,
            },
          },
        },
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
              Exam Submissions
            </p>
            <h1 className="mt-2 text-2xl font-black">模拟考试提交记录</h1>
          </div>
          <Link className="btn btn-secondary" href="/student/submissions">
            查看日常提交
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">ID</th>
                <th className="table-head px-5 py-3">考试</th>
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
                  <td className="px-5 py-4 font-black">
                    {submission.exam ? (
                      <Link
                        className="hover:text-steel"
                        href={`/student/exams/${submission.exam.id}`}
                      >
                        {submission.exam.title}
                      </Link>
                    ) : (
                      "已删除考试"
                    )}
                  </td>
                  <td className="px-5 py-4 font-black">
                    {submission.exam ? (
                      <Link
                        className="hover:text-steel"
                        href={`/student/exams/${submission.exam.id}/take?problemId=${submission.problem.id}`}
                      >
                        {submission.problem.title}
                      </Link>
                    ) : (
                      submission.problem.title
                    )}
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
                      {submission.exam?.records[0]?.status === "in_progress" ? (
                        <Link
                          className="btn btn-primary px-3 py-2 text-sm"
                          href={`/student/exams/${submission.exam.id}/take?problemId=${submission.problem.id}&fromSubmission=${submission.id}`}
                        >
                          继续修改
                        </Link>
                      ) : null}
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
                    colSpan={8}
                  >
                    还没有模拟考试提交。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath="/student/exam-submissions"
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
