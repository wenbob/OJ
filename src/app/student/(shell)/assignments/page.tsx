import Link from "next/link";
import { Archive, ArrowRight, CheckCircle2, Target } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { getAssignmentProgress } from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";

export default async function StudentAssignmentsPage() {
  const user = await requirePageUser("student");
  const assignments = await prisma.learningAssignment.findMany({
    where: { studentId: user.id },
    include: { problems: { orderBy: { order: "asc" } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const rows = assignments.map((assignment) => ({
    ...assignment,
    progress: getAssignmentProgress(assignment.problems),
  }));
  const active = rows.filter(
    (assignment) => assignment.status === "active" && !assignment.progress.completed,
  );
  const completed = rows.filter(
    (assignment) => assignment.status === "active" && assignment.progress.completed,
  );
  const archived = rows.filter((assignment) => assignment.status === "archived");

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen md:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Focused Training</p>
            <h1 className="mt-2 text-3xl font-black">专项练习</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
              老师根据你的薄弱点挑选了练习。只有从这里进入题目并重新通过，才会计入任务进度。
            </p>
          </div>
          <div className="grid min-w-64 grid-cols-2 border-t border-white/10 md:border-l md:border-t-0">
            <HeaderStat label="待完成" value={active.length} />
            <HeaderStat label="已完成" value={completed.length} />
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="surface mt-6 p-8 text-center">
          <Target className="mx-auto text-steel" size={34} />
          <h2 className="mt-4 text-xl font-black">暂时没有专项练习</h2>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            继续完成日常刷题，老师会根据你的训练情况安排更有针对性的练习。
          </p>
        </section>
      ) : (
        <div className="mt-7 grid gap-8">
          <AssignmentGroup assignments={active} title="进行中" />
          <AssignmentGroup assignments={completed} title="已完成" />
          <AssignmentGroup assignments={archived} title="已归档" />
        </div>
      )}
    </>
  );
}

type AssignmentRow = Awaited<ReturnType<typeof prisma.learningAssignment.findMany>>[number] & {
  progress: ReturnType<typeof getAssignmentProgress>;
  problems: Array<{ completedAt: Date | null }>;
};

function AssignmentGroup({
  assignments,
  title,
}: {
  assignments: AssignmentRow[];
  title: string;
}) {
  if (assignments.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {title === "已完成" ? <CheckCircle2 className="text-emerald-700" size={19} /> : null}
        {title === "已归档" ? <Archive className="text-ink-500" size={19} /> : null}
        {title === "进行中" ? <Target className="text-clay" size={19} /> : null}
        <h2 className="text-xl font-black text-ink-950">{title}</h2>
        <span className="text-xs font-black text-ink-500">{assignments.length} 份</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {assignments.map((assignment) => (
          <Link
            className="arena-link-card surface block p-5"
            href={`/student/assignments/${assignment.id}`}
            key={assignment.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-ink-950">{assignment.title}</h3>
                <p className="mt-1 text-xs font-bold text-ink-600">
                  {assignment.dueAt ? `截止 ${formatDate(assignment.dueAt)}` : "不限截止日期"}
                </p>
              </div>
              <span className="data-number text-2xl font-black text-steel">
                {assignment.progress.percent}%
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden bg-ink-950/10">
              <div
                className="h-full bg-steel"
                style={{ width: `${assignment.progress.percent}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-ink-600">
              <span>
                {assignment.progress.completedCount}/{assignment.progress.problemCount} 题完成
              </span>
              <span className="inline-flex items-center gap-1 text-clay">
                查看任务 <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HeaderStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-h-28 flex-col justify-center border-r border-white/10 px-5 last:border-r-0">
      <span className="data-number text-3xl font-black text-[#f2d28c]">{value}</span>
      <span className="mt-1 text-xs font-bold text-[#d7d0c2]">{label}</span>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
