// Shared server page for administrator and teacher shells.
import { PageHeading } from "@/components/PageHeading";
import { FilterLink } from "@/components/FilterChip";
import { Pagination } from "@/components/Pagination";
import { readPaginationFromObject, buildPaginationMeta } from "@/lib/pagination";
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

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function StaffExamsPage({ role, searchParams }: { role: StaffRole } & PageProps) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const query = await searchParams;
  const archived = query.view === "archived";
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = { ...getExamAccessWhere(user), archivedAt: archived ? { not: null } : null };
  const [exams, total] = await Promise.all([prisma.exam.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip, take: pageSize,
    include: {
      createdBy: { select: { role: true, username: true } },
      _count: { select: { problems: true, records: true, submissions: true, aiConversations: true, archiveAudits: true } },
      archiveAudits: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
        select: { action: true, operatorUsername: true, operatorRole: true, createdAt: true } },
    },
  }), prisma.exam.count({ where })]);
  const clientExams = exams.map((exam) => ({
    ...exam,
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
    archivedAt: exam.archivedAt?.toISOString() ?? null,
    archiveAudits: exam.archiveAudits.map((audit) => ({ ...audit, createdAt: audit.createdAt.toISOString() })),
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
        <nav aria-label="考试列表筛选" className="flex flex-wrap gap-2 border-b border-ink-950/10 px-5 py-4">
          <FilterLink active={!archived} href={`${basePath}/exams`} pendingLabel="正在加载考试">未归档</FilterLink>
          <FilterLink active={archived} href={`${basePath}/exams?view=archived`} pendingLabel="正在加载归档考试">已归档</FilterLink>
        </nav>
        <ExamListClient basePath={basePath} exams={clientExams} archived={archived} />
        <Pagination basePath={`${basePath}/exams`} {...buildPaginationMeta({ page, pageSize, total })} searchParams={archived ? { view: "archived" } : {}} />
      </section>
    </>
  );
}

export default function AdminExamsPage(props: PageProps) {
  return <StaffExamsPage role="admin" {...props} />;
}
