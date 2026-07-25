// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getOrderedProblemCategories } from "@/lib/problemOrdering";
import {
  getExamAccessWhere,
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { ExamEditClient } from "../../exam-edit-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function StaffEditExamPage({
  params,
  role,
}: PageProps & { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const { id } = await params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) notFound();

  const exam = await prisma.exam.findFirst({
    where: getExamAccessWhere(user, examId),
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
    select: { category: true },
  });
  const categories = await getOrderedProblemCategories(
    prisma,
    normalizeProblemType(exam.examType),
    categoryRows.map((item) => item.category).filter(Boolean),
  );
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
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            Edit Exam
          </p>
          <h1 className="mt-2 text-2xl font-black">编辑模拟考试</h1>
        </div>
        <Link className="btn btn-secondary" href={`${basePath}/exams`}>
          返回考试管理
        </Link>
      </div>
      <ExamEditClient
        allowMarkdownImport={role === "admin"}
        basePath={basePath}
        categories={categories}
        exam={clientExam}
      />
    </AppShell>
  );
}

export default function AdminEditExamPage(props: PageProps) {
  return <StaffEditExamPage {...props} role="admin" />;
}
