import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { ObjectiveSubmissionBreakdown } from "@/components/ObjectiveSubmissionBreakdown";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import {
  calculateExamScore,
  expireExamRecordIfNeeded,
  getExamEndAt,
} from "@/lib/examScoring";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudentExamResultPage({ params }: PageProps) {
  const user = await requirePageUser("student");
  const { id } = await params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();

  const [exam, record] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        description: true,
        durationMin: true,
        status: true,
        examType: true,
      },
    }),
    expireExamRecordIfNeeded({ examId, userId: user.id }),
  ]);

  if (!exam || !record) notFound();

  const score = await calculateExamScore({
    examId,
    submittedBefore: getExamEndAt(record.startedAt, exam.durationMin),
    userId: user.id,
  });
  const isFinished = record.status === "submitted" || record.status === "expired";
  const reviewSubmissionIds = isFinished
    ? score.problemResults.flatMap((item) =>
        item.reviewSubmissionId === null ? [] : [item.reviewSubmissionId],
      )
    : [];
  const reviewSubmissions =
    reviewSubmissionIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            examId,
            id: { in: reviewSubmissionIds },
            submissionType: "exam",
            userId: user.id,
          },
          select: {
            id: true,
            problemId: true,
            caseResults: {
              orderBy: { caseIndex: "asc" },
              select: {
                actualOutput: true,
                caseIndex: true,
                status: true,
              },
            },
          },
        })
      : [];
  const reviewSubmissionById = new Map(
    reviewSubmissions.map((submission) => [submission.id, submission]),
  );

  return (
    <>
      <section className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Exam Result
            </p>
            <h1 className="mt-2 text-3xl font-black">{exam.title}</h1>
            <div className="mt-3">
              <ProblemTypeBadge type={exam.examType} />
            </div>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap leading-7 text-ink-700">
              {exam.description || "暂无考试说明"}
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={record.status} />
            <p className="mt-3 text-4xl font-black text-steel">
              {isFinished ? score.totalScore : "-"} 分
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoItem label="考试状态" value={exam.status} />
          <InfoItem label="记录状态" value={record.status} />
          <InfoItem label="开始时间" value={formatDate(record.startedAt)} />
          <InfoItem
            label="交卷时间"
            value={record.submittedAt ? formatDate(record.submittedAt) : "尚未交卷"}
          />
        </dl>

        {!isFinished ? (
          <div className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            考试尚未结束。
            {exam.status === "published" ? (
              <Link className="ml-3 font-black text-steel" href={`/student/exams/${exam.id}/take`}>
                继续考试
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <h2 className="text-xl font-black">每题结果</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">题目</th>
                <th className="table-head px-5 py-3">最高状态</th>
                <th className="table-head px-5 py-3">得分</th>
                <th className="table-head px-5 py-3">满分</th>
                <th className="table-head px-5 py-3">提交次数</th>
              </tr>
            </thead>
            <tbody>
              {score.problemResults.map((item) => {
                const reviewSubmission =
                  item.reviewSubmissionId === null
                    ? null
                    : reviewSubmissionById.get(item.reviewSubmissionId);
                const validReviewSubmission =
                  reviewSubmission?.problemId === item.problemId
                    ? reviewSubmission
                    : null;

                return (
                  <Fragment key={item.problemId}>
                    <tr className="border-b border-ink-950/10">
                      <td className="px-5 py-4 font-black">{item.title}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={item.bestStatus} />
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                        {item.score}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                        {item.maxScore}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                        {item.submissionCount}
                      </td>
                    </tr>
                    {isFinished && validReviewSubmission ? (
                      <tr className="border-b border-ink-950/10 bg-linen/35">
                        <td className="px-5 pb-5" colSpan={5}>
                          <ObjectiveSubmissionBreakdown
                            caseResults={validReviewSubmission.caseResults}
                            detailHref={`/student/submissions/${validReviewSubmission.id}`}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-ink-950/10 bg-white/60 p-3">
      <dt className="text-xs font-black uppercase tracking-[0.12em] text-ink-600">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-bold text-ink-950">{value}</dd>
    </div>
  );
}
