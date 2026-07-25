// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import {
  getExamAccessWhere,
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { ExamListClient } from "./exam-list-client";

export async function StaffExamsPage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const exams = await prisma.exam.findMany({
    where: getExamAccessWhere(user),
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { role: true, username: true } },
      _count: { select: { problems: true } },
    },
  });
  const clientExams = exams.map((exam) => ({
    ...exam,
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
  }));

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/10 p-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              {role === "admin" ? "Exam Admin" : "My Exams"}
            </p>
            <h1 className="mt-2 text-2xl font-black">
              {role === "admin" ? "模拟考试管理" : "我的考试"}
            </h1>
          </div>
          <Link className="btn btn-primary" href={`${basePath}/exams/new`}>
            <Plus size={16} />
            新建考试
          </Link>
        </div>
        <ExamListClient basePath={basePath} exams={clientExams} />
      </section>
    </AppShell>
  );
}

export default function AdminExamsPage() {
  return <StaffExamsPage role="admin" />;
}
