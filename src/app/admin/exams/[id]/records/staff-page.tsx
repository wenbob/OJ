// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/Pagination";
import { ResumeExamRecordControl } from "@/components/ResumeExamRecordControl";
import { StatusBadge } from "@/components/StatusBadge";
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
import {
  getExamAccessWhere,
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function StaffExamRecordsPage({
  params,
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const { id } = await params;
  const query = await searchParams;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();
  const { page, pageSize } = readPaginationFromObject(query);
  const usernameQuery = Array.isArray(query.username)
    ? query.username[0]?.trim()
    : query.username?.trim();

  const exam = await prisma.exam.findFirst({
    where: getExamAccessWhere(user, examId),
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
        _count: { select: { resumeAudits: true } },
        resumeAudits: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            createdAt: true,
            operatorRole: true,
            operatorUsername: true,
            reason: true,
          },
          take: 1,
        },
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
        .map(
          async (record) =>
            [
              record.id,
              (
                await calculateExamScore({
                  examId,
                  submittedBefore: getExamEndAt(record.startedAt, durationMin),
                  userId: record.userId,
                })
              ).totalScore,
            ] as const,
        ),
    ),
  );

  return (
    <>
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
          <Link className="btn btn-secondary" href={`${basePath}/exams`}>
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
            <Link
              className="btn btn-secondary"
              href={`${basePath}/exams/${exam.id}/records`}
            >
              重置
            </Link>
          </div>
        </form>
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">用户名</th>
                <th className="table-head px-5 py-3">角色</th>
                <th className="table-head px-5 py-3">开始时间</th>
                <th className="table-head px-5 py-3">交卷时间</th>
                <th className="table-head px-5 py-3">状态</th>
                <th className="table-head px-5 py-3">总分</th>
                <th className="table-head px-5 py-3">恢复记录</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map((record) => {
                const latestResume = record.resumeAudits[0];
                const canResume =
                  examStatus === "published" &&
                  record.user.role === "student" &&
                  record.status === "submitted" &&
                  !isExamExpired({ durationMin, startedAt: record.startedAt });

                return (
                  <tr
                    className="border-b border-ink-950/10 align-top"
                    key={record.id}
                  >
                    <td className="px-5 py-4 font-black">
                      {record.user.username}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {record.user.role}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {formatDate(record.startedAt)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {record.submittedAt
                        ? formatDate(record.submittedAt)
                        : "未交卷"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                      {record.status === "in_progress"
                        ? "-"
                        : (scoreByRecordId.get(record.id) ??
                          record.totalScore ??
                          "-")}
                    </td>
                    <td className="max-w-72 px-5 py-4 text-sm text-ink-700">
                      {latestResume ? (
                        <div className="grid gap-1">
                          <span className="font-black">
                            共 {record._count.resumeAudits} 次
                          </span>
                          <span className="text-xs font-semibold">
                            最近：{latestResume.operatorUsername}（
                            {latestResume.operatorRole}）·{" "}
                            {formatDate(latestResume.createdAt)}
                          </span>
                          <span
                            className="line-clamp-2 text-xs font-semibold text-ink-600"
                            title={latestResume.reason}
                          >
                            原因：{latestResume.reason}
                          </span>
                        </div>
                      ) : (
                        <span className="font-semibold text-ink-500">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          className="btn btn-secondary px-3 py-2 text-sm"
                          href={`${basePath}/exam-submissions?examId=${exam.id}&username=${encodeURIComponent(record.user.username)}`}
                        >
                          查看提交
                        </Link>
                        {canResume ? (
                          <ResumeExamRecordControl
                            examId={exam.id}
                            recordId={record.id}
                            studentUsername={record.user.username}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagedRecords.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                    colSpan={8}
                  >
                    暂无学生参加该考试。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`${basePath}/exams/${exam.id}/records`}
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

export default function AdminExamRecordsPage(props: PageProps) {
  return <StaffExamRecordsPage {...props} role="admin" />;
}
