// Shared server page for administrator and teacher shells.
import Link from "next/link";
import { BookOpenCheck, Clock3, Users } from "lucide-react";
import { isLearningWindow, type LearningWindow } from "@/lib/learningAnalytics";
import { getTeacherLearningDashboard } from "@/lib/teacherLearning";
import {
  getStaffBasePath,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";
import { StudentLearningDirectory } from "./student-learning-directory";

type PageProps = {
  searchParams: Promise<{ window?: string | string[] }>;
};

export async function StaffLearningPage({
  role,
  searchParams,
}: PageProps & { role: StaffRole }) {
  await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const rawWindow = (await searchParams).window;
  const selectedWindow = Array.isArray(rawWindow) ? rawWindow[0] : rawWindow;
  const window: LearningWindow = isLearningWindow(selectedWindow)
    ? selectedWindow
    : "30d";
  const dashboard = await getTeacherLearningDashboard(window);

  return (
    <>
      <section className="surface overflow-hidden">
        <div className="grid bg-ink-950 text-linen lg:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <p className="arena-kicker text-[#d7a062]">Learning Command</p>
            <h1 className="mt-2 text-3xl font-black">教师学情看板</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
              用日常和考试中的编程提交识别真实困难，再从现有题库组织专项练习。
            </p>
          </div>
          <WindowTabs basePath={basePath} current={window} />
        </div>
        <div className="grid bg-white/45 sm:grid-cols-3">
          <OverviewStat icon={<Users size={18} />} label="周期活跃学生" value={`${dashboard.summary.activeStudentCount}/${dashboard.summary.studentCount}`} />
          <OverviewStat icon={<Clock3 size={18} />} label="需要关注" value={dashboard.summary.needsAttentionCount} />
          <OverviewStat icon={<BookOpenCheck size={18} />} label="未完成专项练习" value={dashboard.summary.incompleteAssignmentCount} />
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
          <StudentLearningDirectory
            basePath={basePath}
            key={window}
            rows={dashboard.rows.map((row) => ({
              assignmentCompletedCount: row.assignmentCompletedCount,
              assignmentProblemCount: row.assignmentProblemCount,
              directoryInitial: row.student.directoryInitial,
              directorySortKey: row.student.directorySortKey,
              hasLearningData: row.analytics.hasLearningData,
              issueLabels: row.analytics.issueLabels,
              lastTrainingAt:
                row.analytics.summary.lastTrainingAt?.toISOString() ?? null,
              pendingProblemCount: row.analytics.summary.pendingProblemCount,
              submissionCount: row.analytics.summary.submissionCount,
              topCategory: row.analytics.categories[0]?.category ?? null,
              uniqueAcceptedInWindow:
                row.analytics.summary.uniqueAcceptedInWindow,
              userId: row.student.id,
              username: row.student.username,
            }))}
            window={window}
          />
        )}
      </section>
    </>
  );
}

function WindowTabs({
  basePath,
  current,
}: {
  basePath: string;
  current: LearningWindow;
}) {
  return (
    <div className="flex items-center border-t border-white/10 p-5 lg:border-l lg:border-t-0">
      <div className="flex gap-2">
        {(["7d", "30d", "all"] as const).map((value) => (
          <Link
            className={`btn ${current === value ? "border-[#d6a44a] bg-[#d6a44a] text-ink-950" : "border-white/15 bg-white/5 text-linen"}`}
            href={`${basePath}/learning?window=${value}`}
            key={value}
          >
            {value === "all" ? "全部" : value === "7d" ? "近 7 天" : "近 30 天"}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminLearningPage(props: PageProps) {
  return <StaffLearningPage {...props} role="admin" />;
}

function OverviewStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-ink-950/10 p-5 sm:border-b-0 sm:border-r last:border-r-0">
      <div className="flex items-center gap-2 text-steel">{icon}<span className="text-xs font-black text-ink-600">{label}</span></div>
      <p className="data-number mt-2 text-3xl font-black text-ink-950">{value}</p>
    </div>
  );
}
