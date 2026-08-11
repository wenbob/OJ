import Link from "next/link";
import { ChevronRight, Timer } from "lucide-react";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StartExamButton } from "@/components/StartExamButton";
import { requirePageUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function StudentExamsPage() {
  const user = await requirePageUser("student");
  const exams = await prisma.exam.findMany({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
    include: {
      records: {
        where: { userId: user.id },
        select: { status: true },
        take: 1,
      },
      _count: { select: { problems: true } },
    },
  });

  return (
    <>
      <section className="surface p-5">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
          Mock Exam
        </p>
        <h1 className="mt-2 text-2xl font-black">模拟考试</h1>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          这里只展示管理员已发布的考试。
        </p>
      </section>

      <section className="mt-6 grid gap-4">
        {exams.map((exam) => (
          <div className="surface p-5" key={exam.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black">{exam.title}</h2>
                  <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                    可参加
                  </span>
                  <ProblemTypeBadge type={exam.examType} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink-600">
                  {exam.description || "暂无考试说明"}
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold text-ink-700">
                  <span>{exam._count.problems} 道题</span>
                  <span className="inline-flex items-center gap-1">
                    <Timer size={15} />
                    {exam.durationMin ? `${exam.durationMin} 分钟` : "不限时"}
                  </span>
                  <span>发布于 {formatDate(exam.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Link
                  className="btn btn-secondary"
                  href={`/student/exams/${exam.id}`}
                >
                  查看详情
                  <ChevronRight size={16} />
                </Link>
                <StartExamButton
                  examId={exam.id}
                  initialStatus={exam.records[0]?.status}
                />
              </div>
            </div>
          </div>
        ))}
        {exams.length === 0 ? (
          <div className="surface p-10 text-center text-sm font-semibold text-ink-600">
            暂无已发布考试。
          </div>
        ) : null}
      </section>
    </>
  );
}
