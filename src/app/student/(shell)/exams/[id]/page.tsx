import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Timer } from "lucide-react";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { StartExamButton } from "@/components/StartExamButton";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudentExamDetailPage({ params }: PageProps) {
  const user = await requirePageUser("student");
  const { id } = await params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      records: {
        where: { userId: user.id },
        select: { status: true },
        take: 1,
      },
      problems: {
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              category: true,
              problemType: true,
            },
          },
        },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!exam) notFound();
  const examRecord = exam.records[0];
  if (exam.status !== "published" && !examRecord) notFound();

  return (
    <>
      <section className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Mock Exam
            </p>
            <h1 className="mt-2 text-3xl font-black">{exam.title}</h1>
            <div className="mt-3">
              <ProblemTypeBadge type={exam.examType} />
            </div>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap leading-7 text-ink-700">
              {exam.description || "暂无考试说明"}
            </p>
          </div>
          <div className="border border-ink-950/10 bg-white/65 px-4 py-3 text-sm font-bold text-ink-700">
            <span className="inline-flex items-center gap-2">
              <Timer size={16} />
              {exam.durationMin ? `${exam.durationMin} 分钟` : "不限时"}
            </span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {exam.status === "published" ? (
            <StartExamButton
              examId={exam.id}
              initialStatus={examRecord?.status}
            />
          ) : (
            <Link className="btn btn-primary" href={`/student/exams/${exam.id}/result`}>
              查看结果
              <ChevronRight size={16} />
            </Link>
          )}
          <Link className="btn btn-secondary" href="/student/exams">
            返回考试列表
          </Link>
        </div>
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <h2 className="text-xl font-black">考试题目</h2>
        </div>
        <div className="divide-y divide-ink-950/10">
          {exam.problems.map((item, index) => (
            <div
              className="grid gap-3 px-5 py-4 md:grid-cols-[80px_minmax(0,1fr)_180px]"
              key={item.id}
            >
              <span className="text-sm font-black text-ink-500">
                第 {index + 1} 题
              </span>
              <div>
                <h3 className="font-black">{item.problem.title}</h3>
                <p className="mt-1 text-sm font-semibold text-ink-600">
                  {item.problem.category || "未分类"} / {item.problem.difficulty}
                </p>
                <div className="mt-2">
                  <ProblemTypeBadge type={item.problem.problemType} />
                </div>
              </div>
              <div className="text-sm font-bold text-ink-700">
                {item.score} 分
              </div>
            </div>
          ))}
          {exam.problems.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-ink-600">
              该考试暂未添加题目。
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
