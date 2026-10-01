// Shared server page for administrator and teacher shells.
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { ExamFormClient } from "../exam-form-client";

export async function StaffNewExamPage({ role }: { role: StaffRole }) {
  await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="arena-kicker">
            New Exam
          </p>
          <PageHeading kind="exam" className="mt-2">新建模拟考试</PageHeading>
        </div>
        <Link className="btn btn-secondary" href={`${basePath}/exams`}>
          返回考试管理
        </Link>
      </div>
      <ExamFormClient basePath={basePath} mode="create" />
    </>
  );
}

export default function AdminNewExamPage() {
  return <StaffNewExamPage role="admin" />;
}
