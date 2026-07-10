import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import {
  calculateExamScore,
  finishExamRecord,
  getExamEndAt,
  isExamExpired,
} from "@/lib/examScoring";
import { formatDate } from "@/lib/format";
import {
  buildPaginationMeta,
  readPaginationFromObject,
} from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

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
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminExamRecordsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  const query = await searchParams;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();
  const { page, pageSize } = readPaginationFromObject(query);
  const usernameQuery = Array.isArray(query.username)
    ? query.username[0]?.trim()
    : query.username?.trim();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      _count: { select: { problems: true } },
    },
  });

  if (!exam) notFound();

  const examStatus = exam.status;
  const durationMin = exam.durationMin;
  const activeRecords = await prisma.examRecord.findMany({
    where: { examId, status: "in_progress" },
    select: { startedAt: true, userId: true },
  });
  const expiredRecords = activeRecords.filter(
    (record) =>
      examStatus !== "published" ||
      isExamExpired({
        durationMin,
        startedAt: record.startedAt,
      }),
  );

  if (expiredRecords.length > 0) {
    await Promise.all(
      expiredRecords.map((record) =>
        finishExamRecord({
          examId,
          status: "expired",
          userId: record.userId,
        }),
      ),
    );

  }

  const recordWhere = {
    examId,
    ...(usernameQuery
      ? {
          user: {
            username: { contains: usernameQuery },
          },
        }
      : {}),
  };
  const [pagedRecords, totalRecords] = await Promise.all([
    prisma.examRecord.findMany({
      where: recordWhere,
      include: {
        user: {
          select: {
            id: true,
            role: true,
            username: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.examRecord.count({ where: recordWhere }),
  ]);
  const pagination = buildPaginationMeta({
    page,
    pageSize,
    total: totalRecords,
  });
  const scoreByRecordId = new Map(
    await Promise.all(
      pagedRecords
        .filter((record) => record.status !== "in_progress")
        .map(async (record) => [
          record.id,
          (
            await calculateExamScore({
              examId,
              submittedBefore: getExamEndAt(record.startedAt, durationMin),
              userId: record.userId,
            })
          ).totalScore,
        ] as const),
    ),
  );

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Exam Records
            </p>
            <h1 className="mt-2 text-2xl font-black">{exam.title}：考试记录</h1>
            <p className="mt-2 text-sm font-semibold text-ink-600">
              当前 {totalRecords} 条记录，考试题目 {exam._count.problems} 道。
            </p>
          </div>
          <Link className="btn btn-secondary" href="/admin/exams">
            返回考试管理
          </Link>
        </div>
        <form className="mt-5 flex flex-wrap gap-3" method="GET">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            用户名
            <input
              className="field min-w-64"
              defaultValue={usernameQuery ?? ""}
              name="username"
              placeholder="模糊搜索"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" type="submit">
              筛选
            </button>
            <Link className="btn btn-secondary" href={`/admin/exams/${exam.id}/records`}>
              重置
            </Link>
          </div>
        </form>
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">用户名</th>
                <th className="table-head px-5 py-3">角色</th>
                <th className="table-head px-5 py-3">开始时间</th>
                <th className="table-head px-5 py-3">交卷时间</th>
                <th className="table-head px-5 py-3">状态</th>
                <th className="table-head px-5 py-3">总分</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map((record) => (
                <tr className="border-b border-ink-950/10" key={record.id}>
                  <td className="px-5 py-4 font-black">{record.user.username}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {record.user.role}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {formatDate(record.startedAt)}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {record.submittedAt ? formatDate(record.submittedAt) : "未交卷"}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {record.status === "in_progress"
                      ? "-"
                      : scoreByRecordId.get(record.id) ?? record.totalScore ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      className="btn btn-secondary px-3 py-2 text-sm"
                      href={`/admin/exam-submissions?examId=${exam.id}&username=${encodeURIComponent(record.user.username)}`}
                    >
                      查看提交
                    </Link>
                  </td>
                </tr>
              ))}
              {pagedRecords.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                    colSpan={7}
                  >
                    暂无学生参加该考试。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`/admin/exams/${exam.id}/records`}
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
