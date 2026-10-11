import Link from "next/link";
import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { FilterLink } from "@/components/FilterChip";
import { PageHeading } from "@/components/PageHeading";
import { Pagination } from "@/components/Pagination";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { UiBadge } from "@/components/UiBadge";
import { calculateExamScore, getExamEndAt } from "@/lib/examScoring";
import { formatDate } from "@/lib/format";
import { readPaginationFromObject, buildPaginationMeta } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

export async function StudentExamHistory({ userId, query }: {
  userId: number; query: Record<string, string | string[] | undefined>;
}) {
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = { userId, OR: [{ status: { not: "in_progress" } }, { exam: { status: "ended" } }] };
  const [records, total] = await Promise.all([
    prisma.examRecord.findMany({ where, skip, take: pageSize,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      include: { exam: { select: { id: true, title: true, examType: true, archivedAt: true, durationMin: true } } },
    }),
    prisma.examRecord.count({ where }),
  ]);
  const scores = await Promise.all(records.map(async (record) => record.status === "in_progress" ? null :
    (await calculateExamScore({ examId: record.examId, userId, submittedBefore: getExamEndAt(record.startedAt, record.exam.durationMin) })).totalScore));
  return <>
    <section className="surface p-5">
      <p className="arena-kicker">Mock Exam</p>
      <PageHeading kind="exam" className="mt-2">模拟考试</PageHeading>
      <nav aria-label="模拟考试列表" className="mt-4 flex flex-wrap gap-2">
        <FilterLink active={false} href="/student/exams" pendingLabel="正在加载考试">可参加考试</FilterLink>
        <FilterLink active href="/student/exams?view=history" pendingLabel="正在加载历史考试">我的历史考试</FilterLink>
      </nav>
      <p className="mt-4 text-sm font-semibold text-ink-600">共 {total} 场历史考试，考试归档后仍可查看自己的成绩与提交。</p>
    </section>
    <section className="mt-6 grid gap-4">
      {records.map((record, index) => <article className="surface p-5" key={record.id}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold">{record.exam.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <ProblemTypeBadge type={record.exam.examType} />
              <StatusBadge status={record.status} />
              {record.exam.archivedAt ? <UiBadge>已归档</UiBadge> : null}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-600">开始于 {formatDate(record.startedAt)}{record.submittedAt ? ` · 交卷于 ${formatDate(record.submittedAt)}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-2xl font-black text-steel">{scores[index] === null ? "待结算" : `${scores[index]} 分`}</p>
            <Link className="btn btn-primary" href={`/student/exams/${record.examId}/result`}>查看成绩与复盘</Link>
          </div>
        </div>
      </article>)}
      {records.length === 0 ? <div className="surface"><AcademyEmptyState kind="exam" title="暂无历史考试" description="完成考试后，成绩和复盘记录会显示在这里。" /></div> : null}
    </section>
    <Pagination basePath="/student/exams" {...buildPaginationMeta({ page, pageSize, total })} searchParams={{ view: "history" }} />
  </>;
}
