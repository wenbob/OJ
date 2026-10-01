// Shared server page for administrator and teacher shells.
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  getExamAccessWhere,
  getStaffBasePath,
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
    <>
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/10 p-5">
          <div>
            <p className="arena-kicker">
              {role === "admin" ? "Exam Admin" : "My Exams"}
            </p>
            <PageHeading kind="exam" className="mt-2">
              {role === "admin" ? "模拟考试管理" : "我的考试"}
            </PageHeading>
          </div>
          <Link className="btn btn-primary" href={`${basePath}/exams/new`}>
            <Plus size={16} />
            新建考试
          </Link>
        </div>
        <ExamListClient basePath={basePath} exams={clientExams} />
      </section>
    </>
  );
}

export default function AdminExamsPage() {
  return <StaffExamsPage role="admin" />;
}
