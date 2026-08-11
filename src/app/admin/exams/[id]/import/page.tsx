import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { ExamImportClient } from "./exam-import-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminExamImportPage({ params }: PageProps) {
  await requirePageUser("admin");
  const { id } = await params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, examType: true },
  });
  if (!exam) notFound();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Import To Exam
          </p>
          <h1 className="mt-2 text-2xl font-black">
            导入题目到「{exam.title}」
          </h1>
        </div>
        <Link className="btn btn-secondary" href={`/admin/exams/${exam.id}/edit`}>
          返回考试编辑
        </Link>
      </div>
      <ExamImportClient
        examId={exam.id}
        examType={normalizeProblemType(exam.examType)}
      />
    </>
  );
}
