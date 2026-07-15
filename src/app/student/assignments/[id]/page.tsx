import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import { getAssignmentProgress } from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/serverTime";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

type PageProps = { params: Promise<{ id: string }> };

export default async function StudentAssignmentDetailPage({ params }: PageProps) {
  const user = await requirePageUser("student");
  const assignmentId = Number((await params).id);
  if (!Number.isInteger(assignmentId)) notFound();
  const assignment = await prisma.learningAssignment.findFirst({
    where: { id: assignmentId, studentId: user.id },
    include: { problems: { orderBy: { order: "asc" } } },
  });
  if (!assignment) notFound();
  const progress = getAssignmentProgress(assignment.problems);
  const now = getServerNow();
  const overdue = Boolean(
    assignment.status === "active" &&
      !progress.completed &&
      assignment.dueAt &&
      assignment.dueAt.getTime() < now,
  );

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      <Link className="mb-4 inline-flex items-center gap-2 text-sm font-black text-steel" href="/student/assignments">
        <ArrowLeft size={16} /> 返回专项练习
      </Link>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_300px]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Teacher Assignment</p>
            <h1 className="mt-2 text-3xl font-black">{assignment.title}</h1>
            <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#d7d0c2]">
              {assignment.note || "老师暂未填写额外说明，按顺序完成下面的题目即可。"}
            </p>
            <p className={`mt-5 inline-flex items-center gap-2 text-sm font-black ${overdue ? "text-rose-300" : "text-[#f2d28c]"}`}>
              <Clock3 size={16} />
              {assignment.dueAt
                ? `${overdue ? "已超过截止时间，仍可继续补做" : "截止时间"}：${formatDate(assignment.dueAt)}`
                : "不限截止日期"}
            </p>
          </div>
          <div className="border-t border-white/10 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#bdb5a7]">完成进度</p>
            <p className="data-number mt-2 text-5xl font-black text-[#f2d28c]">{progress.percent}%</p>
            <p className="mt-2 text-sm font-bold text-[#d7d0c2]">
              已完成 {progress.completedCount}/{progress.problemCount} 题
            </p>
            <div className="mt-4 h-2 overflow-hidden bg-white/10">
              <div className="h-full bg-[#d6a44a]" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="surface mt-6 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <p className="arena-kicker">Problem Route</p>
          <h2 className="mt-1 text-2xl font-black">按顺序完成</h2>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            从本页进入并提交 Accepted 才会计入；历史通过记录不会自动抵扣。
          </p>
        </div>
        <div className="divide-y divide-ink-950/10">
          {assignment.problems.map((item, index) => {
            const completed = Boolean(item.completedAt);
            const href = item.problemId
              ? assignment.status === "active"
                ? `/student/problems/${item.problemId}?assignment=${assignment.id}`
                : `/student/problems/${item.problemId}`
              : null;
            const content = (
              <>
                <span className={`flex h-10 w-10 flex-none items-center justify-center border font-black ${completed ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-ink-950/15 bg-white text-ink-700"}`}>
                  {completed ? <CheckCircle2 size={19} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black text-ink-950">{item.problemTitle}</span>
                  <span className="mt-1 block text-xs font-bold text-ink-600">
                    {item.problemCategory} · {item.problemDifficulty}
                  </span>
                </span>
                <span className={`text-xs font-black ${completed ? "text-emerald-700" : "text-clay"}`}>
                  {completed ? "已完成" : href ? "去完成" : "题目已移除"}
                </span>
              </>
            );
            return href ? (
              <Link className="arena-link-card flex items-center gap-4 p-5" href={href} key={item.id}>
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-4 bg-stone-50 p-5" key={item.id}>
                <Circle className="text-ink-400" size={18} />
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
