// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { ArrowRight, ClipboardList, Layers3, UsersRound } from "lucide-react";
import { getAssignmentProgress } from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import { getOrderedProblemCategories } from "@/lib/problemOrdering";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { sortStudentsByDirectory } from "@/lib/studentDirectory";
import { AssignmentPublishingWorkspace } from "./assignment-publishing-workspace";

export async function StaffAssignmentsPage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const [studentRows, activeProblemRows, categoryRows, recentAssignments] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "student" },
        select: { id: true, username: true },
      }),
      prisma.learningAssignmentProblem.findMany({
        where: {
          completedAt: null,
          problemId: { not: null },
          assignment: { status: "active" },
        },
        select: {
          assignment: { select: { studentId: true } },
          problemId: true,
          problemTitle: true,
        },
      }),
      prisma.problem.groupBy({
        by: ["category"],
        where: { archivedAt: null, problemType: "programming" },
      }),
      prisma.learningAssignment.findMany({
        where: role === "teacher" ? { createdById: user.id } : undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          createdAt: true,
          createdBy: { select: { username: true } },
          dueAt: true,
          id: true,
          problems: { select: { completedAt: true } },
          status: true,
          student: { select: { id: true, username: true } },
          title: true,
        },
      }),
    ]);
  const categories = await getOrderedProblemCategories(
    prisma,
    "programming",
    categoryRows.map((row) => row.category),
  );
  const activeProblemsByStudent = new Map<
    number,
    Array<{ id: number; title: string }>
  >();
  for (const row of activeProblemRows) {
    if (row.problemId === null) continue;
    const list = activeProblemsByStudent.get(row.assignment.studentId) ?? [];
    if (!list.some((problem) => problem.id === row.problemId)) {
      list.push({ id: row.problemId, title: row.problemTitle });
    }
    activeProblemsByStudent.set(row.assignment.studentId, list);
  }
  const students = sortStudentsByDirectory(studentRows).map((student) => ({
    activeProblems: activeProblemsByStudent.get(student.id) ?? [],
    id: student.id,
    username: student.username,
  }));

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Homework Operations</p>
            <h1 className="mt-2 text-3xl font-black">作业发布</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
              一次选择多名学生，共用基础题单，并在发布前完成每个人的个性化调整。
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-2 border-t border-white/10 lg:border-l lg:border-t-0">
            <HeroStat icon={<UsersRound size={18} />} label="可选学生" value={students.length} />
            <HeroStat icon={<Layers3 size={18} />} label="单人题数" value="1–10" />
          </div>
        </div>
      </section>

      <div className="mt-6">
        <AssignmentPublishingWorkspace
          basePath={basePath}
          categories={categories}
          students={students}
        />
      </div>

      <section className="surface mt-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-950/10 p-5">
          <div>
            <p className="arena-kicker">Recent Assignments</p>
            <h2 className="mt-1 text-xl font-black">最近发布记录</h2>
          </div>
          <p className="text-xs font-bold text-ink-600">
            {role === "admin" ? "最近 50 条全平台任务" : "最近 50 条由我发布的任务"}
          </p>
        </div>
        {recentAssignments.length ? (
          <div className="divide-y divide-ink-950/10">
            {recentAssignments.map((assignment) => {
              const progress = getAssignmentProgress(assignment.problems);
              const statusLabel =
                assignment.status === "archived"
                  ? "已归档"
                  : progress.completed
                    ? "已完成"
                    : "进行中";
              return (
                <Link
                  className="arena-link-card grid gap-3 p-5 md:grid-cols-[1.2fr_1fr_0.8fr_1fr_auto] md:items-center"
                  href={`${basePath}/learning/${assignment.student.id}`}
                  key={assignment.id}
                >
                  <span className="min-w-0">
                    <b className="block truncate text-sm text-ink-950">
                      {assignment.title}
                    </b>
                    <span className="mt-1 block text-xs font-bold text-ink-600">
                      学生：{assignment.student.username}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-ink-600">
                    发布者：{assignment.createdBy?.username ?? "原账号已删除"}
                  </span>
                  <span className="text-xs font-black text-steel">
                    {progress.completedCount}/{progress.problemCount} 题 · {statusLabel}
                  </span>
                  <span className="text-xs font-bold text-ink-600">
                    {assignment.dueAt
                      ? `截止 ${formatDate(assignment.dueAt)}`
                      : "无截止时间"}
                    <br />
                    发布 {formatDate(assignment.createdAt)}
                  </span>
                  <ArrowRight className="text-clay" size={18} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <ClipboardList className="mx-auto text-steel" size={28} />
            <p className="mt-3 text-sm font-semibold text-ink-600">暂无发布记录。</p>
          </div>
        )}
      </section>
    </>
  );
}

export default function AdminAssignmentsPage() {
  return <StaffAssignmentsPage role="admin" />;
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-b border-r border-white/10 p-5">
      <span className="text-[#d7a062]">{icon}</span>
      <p className="data-number mt-2 text-3xl font-black text-[#f2d28c]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#d7d0c2]">{label}</p>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(value);
}
