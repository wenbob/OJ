import Link from "next/link";
import { ArrowRight, BookOpenCheck, Clock3, LibraryBig, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import { isLearningWindow, type LearningWindow } from "@/lib/learningAnalytics";
import { getTeacherLearningDashboard } from "@/lib/teacherLearning";

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
  searchParams: Promise<{ window?: string | string[] }>;
};

export default async function AdminLearningPage({ searchParams }: PageProps) {
  const user = await requirePageUser("admin");
  const rawWindow = (await searchParams).window;
  const selectedWindow = Array.isArray(rawWindow) ? rawWindow[0] : rawWindow;
  const window: LearningWindow = isLearningWindow(selectedWindow)
    ? selectedWindow
    : "30d";
  const dashboard = await getTeacherLearningDashboard(window);

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Learning Command</p>
            <h1 className="mt-2 text-3xl font-black">教师学情看板</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
              用日常和考试中的编程提交识别真实困难，再从现有题库组织专项练习。
            </p>
          </div>
          <WindowTabs current={window} />
        </div>
        <div className="grid bg-white/45 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat icon={<Users size={18} />} label="周期活跃学生" value={`${dashboard.summary.activeStudentCount}/${dashboard.summary.studentCount}`} />
          <OverviewStat icon={<Clock3 size={18} />} label="需要关注" value={dashboard.summary.needsAttentionCount} />
          <OverviewStat icon={<BookOpenCheck size={18} />} label="未完成专项练习" value={dashboard.summary.incompleteAssignmentCount} />
          <OverviewStat icon={<LibraryBig size={18} />} label="题库缺口" value={dashboard.summary.shortageCount} />
        </div>
      </section>

      <section className="surface mt-7 overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <p className="arena-kicker">Small Class View</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-black">全部学生</h2>
            <p className="text-xs font-bold text-ink-600">直接展示小班全员，不分页</p>
          </div>
        </div>
        {dashboard.rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-ink-600">
            暂无学生账号。
          </div>
        ) : (
          <div className="divide-y divide-ink-950/10">
            {dashboard.rows.map((row) => (
              <Link
                className="arena-link-card grid gap-4 p-5 md:grid-cols-[1.15fr_1fr_1fr_auto] md:items-center"
                href={`/admin/learning/${row.student.id}?window=${window}`}
                key={row.student.id}
              >
                <div>
                  <p className="text-lg font-black text-ink-950">{row.student.username}</p>
                  <p className="mt-1 text-xs font-bold text-ink-600">
                    {row.analytics.summary.lastTrainingAt
                      ? `最后训练 ${formatDate(row.analytics.summary.lastTrainingAt)}`
                      : "尚无编程提交"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="提交" value={row.analytics.summary.submissionCount} />
                  <MiniStat label="唯一 AC" value={row.analytics.summary.uniqueAcceptedInWindow} />
                  <MiniStat label="待攻克" value={row.analytics.summary.pendingProblemCount} />
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    {!row.analytics.hasLearningData ? (
                      <Tag label="尚未形成学情" tone="muted" />
                    ) : row.analytics.issueLabels.length ? (
                      row.analytics.issueLabels.slice(0, 2).map((label) => (
                        <Tag key={label} label={label} tone="warn" />
                      ))
                    ) : (
                      <Tag label="训练状态稳定" tone="good" />
                    )}
                  </div>
                  <p className="mt-2 text-xs font-bold text-ink-600">
                    {row.analytics.categories[0]
                      ? `最薄弱：${row.analytics.categories[0].category}`
                      : "暂无薄弱分类"}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 md:justify-end">
                  <span className="text-xs font-bold text-ink-600">
                    专项 {row.assignmentCompletedCount}/{row.assignmentProblemCount}
                  </span>
                  <ArrowRight className="text-clay" size={18} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function WindowTabs({ current }: { current: LearningWindow }) {
  return (
    <div className="flex items-center border-t border-white/10 p-5 lg:border-l lg:border-t-0">
      <div className="flex gap-2">
        {(["7d", "30d", "all"] as const).map((value) => (
          <Link
            className={`btn ${current === value ? "border-[#d6a44a] bg-[#d6a44a] text-ink-950" : "border-white/15 bg-white/5 text-linen"}`}
            href={`/admin/learning?window=${value}`}
            key={value}
          >
            {value === "all" ? "全部" : value === "7d" ? "近 7 天" : "近 30 天"}
          </Link>
        ))}
      </div>
    </div>
  );
}

function OverviewStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-ink-950/10 p-5 sm:border-r xl:border-b-0">
      <div className="flex items-center gap-2 text-steel">{icon}<span className="text-xs font-black text-ink-600">{label}</span></div>
      <p className="data-number mt-2 text-3xl font-black text-ink-950">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <span className="bg-ink-950/[0.04] px-2 py-2"><b className="data-number block text-lg text-ink-950">{value}</b><span className="text-[11px] font-bold text-ink-600">{label}</span></span>;
}

function Tag({ label, tone }: { label: string; tone: "good" | "muted" | "warn" }) {
  const style = tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-ink-950/10 bg-stone-100 text-ink-600";
  return <span className={`border px-2 py-1 text-[11px] font-black ${style}`}>{label}</span>;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}
