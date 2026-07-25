// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { ExamFormClient } from "../exam-form-client";

export async function StaffNewExamPage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
            New Exam
          </p>
          <h1 className="mt-2 text-2xl font-black">新建模拟考试</h1>
        </div>
        <Link className="btn btn-secondary" href={`${basePath}/exams`}>
          返回考试管理
        </Link>
      </div>
      <ExamFormClient basePath={basePath} mode="create" />
    </AppShell>
  );
}

export default function AdminNewExamPage() {
  return <StaffNewExamPage role="admin" />;
}
