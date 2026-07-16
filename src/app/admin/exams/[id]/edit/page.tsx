import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { ExamEditClient } from "../../exam-edit-client";

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
};

export default async function AdminEditExamPage({ params }: PageProps) {
  const user = await requirePageUser("admin");
  const { id } = await params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
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
  const categoryRows = await prisma.problem.findMany({
    where: { archivedAt: null, problemType: exam.examType },
    distinct: ["category"],
    orderBy: { category: "asc" },
    select: { category: true },
  });
  const clientExam = {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    durationMin: exam.durationMin,
    status: exam.status,
    examType: normalizeProblemType(exam.examType),
    aiEnabled: exam.aiEnabled,
    problems: exam.problems.map((item) => ({
      ...item,
      problem: {
        ...item.problem,
        problemType: normalizeProblemType(item.problem.problemType),
      },
    })),
  };

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Edit Exam
          </p>
          <h1 className="mt-2 text-2xl font-black">编辑模拟考试</h1>
        </div>
        <Link className="btn btn-secondary" href="/admin/exams">
          返回考试管理
        </Link>
      </div>
      <ExamEditClient
        categories={categoryRows.map((item) => item.category).filter(Boolean)}
        exam={clientExam}
      />
    </AppShell>
  );
}
