import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FileText,
  GraduationCap,
  History,
  Megaphone,
  PenLine,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentRankings } from "@/lib/ranking";
import { getAdminDisplaySettings } from "@/lib/settings";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

export default async function AdminHomePage() {
  const user = await requirePageUser("admin");
  const [
    problemCount,
    examCount,
    userCount,
    dailySubmissionCount,
    examSubmissionCount,
    rankings,
    settings,
  ] = await Promise.all([
    prisma.problem.count(),
    prisma.exam.count(),
    prisma.user.count(),
    prisma.submission.count({ where: { submissionType: "practice" } }),
    prisma.submission.count({ where: { submissionType: "exam" } }),
    getStudentRankings(),
    getAdminDisplaySettings(),
  ]);

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="mb-6 flex items-start gap-3 border border-clay/25 bg-[#fffaf1] p-4 text-sm font-semibold leading-6 text-ink-700">
        <Megaphone aria-hidden="true" className="mt-0.5 flex-none text-clay" size={18} />
        <span>{settings.adminNotice}</span>
      </section>

      <section className="surface overflow-hidden">
        <div className="relative overflow-hidden bg-ink-950 p-6 text-linen md:p-9">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="arena-kicker text-[#d7a062]">Academy Command</p>
              <h1 className="mt-3 text-3xl font-black md:text-4xl">教学竞技控制台</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#d7d0c2]">
                从这里维护题库、发布考试、管理学生，并查看全站训练进度。
              </p>
            </div>
            <Link className="btn border-[#d6a44a]/35 bg-[#d6a44a]/10 text-[#f2d28c]" href="/admin/settings">
              <Settings size={17} />
              系统设置
            </Link>
          </div>
        </div>
        <div className="grid bg-white/45 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat label="题库题目" value={problemCount} />
          <OverviewStat label="模拟考试" value={examCount} />
          <OverviewStat label="系统用户" value={userCount} />
          <OverviewStat label="天梯学生" value={rankings.length} />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="arena-kicker">Core Operations</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950">教学与竞赛运营</h2>
          </div>
          <p className="text-xs font-bold text-ink-600">高频操作集中在前，减少后台往返</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <AdminEntry
            className="lg:col-span-4"
            count={problemCount}
            href="/admin/practice"
            icon={<PenLine size={23} />}
            label="题目练习"
            text="以管理员身份校题并测试 Judge 流程"
          />
          <AdminEntry
            className="lg:col-span-4"
            count={problemCount}
            href="/admin/problems"
            icon={<FileText size={23} />}
            label="题目管理"
            text="新增、编辑、删除与 Markdown 批量导入"
          />
          <AdminEntry
            className="lg:col-span-4"
            count={examCount}
            href="/admin/exams"
            icon={<GraduationCap size={23} />}
            label="模拟考试管理"
            text="创建、组卷、发布并进入管理员练习模式"
          />
          <AdminEntry
            className="lg:col-span-4"
            count={userCount}
            href="/admin/users"
            icon={<Users size={23} />}
            label="用户与头衔管理"
            text="维护学生和管理员账号，设置学生自定义头衔"
          />
          <AdminEntry
            className="lg:col-span-4"
            count="学情"
            href="/admin/learning"
            icon={<Activity size={23} />}
            label="教师学情看板"
            text="识别学生困难，确认并下发数据库中的专项练习"
          />
          <AdminEntry
            className="lg:col-span-4"
            count={rankings.length}
            href="/admin/leaderboard"
            icon={<Trophy size={23} />}
            label="天梯管理台"
            text="查看实时段位积分、前三名领奖台与完整排名"
          />
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_0.55fr]">
        <div>
          <div className="mb-4">
            <p className="arena-kicker">Submission Review</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950">提交记录</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminEntry
              count={dailySubmissionCount}
              href="/admin/submissions"
              icon={<History size={22} />}
              label="日常提交"
              text="查看学生日常刷题产生的评测记录"
            />
            <AdminEntry
              count={examSubmissionCount}
              href="/admin/exam-submissions"
              icon={<GraduationCap size={22} />}
              label="考试提交"
              text="查看绑定模拟考试的学生提交记录"
            />
          </div>
        </div>
        <div>
          <div className="mb-4">
            <p className="arena-kicker">System</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950">平台维护</h2>
          </div>
          <AdminEntry
            count="配置"
            href="/admin/settings"
            icon={<Settings size={22} />}
            label="系统设置"
            text="平台名称、公告、代码模板、评测限制与 AI 开关"
          />
        </div>
      </section>
    </AppShell>
  );
}

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-ink-950/10 px-5 py-4 sm:border-r xl:border-b-0">
      <p className="data-number text-2xl font-black text-ink-950">{value}</p>
      <p className="mt-0.5 text-xs font-bold text-ink-600">{label}</p>
    </div>
  );
}

function AdminEntry({
  className = "",
  count,
  href,
  icon,
  label,
  text,
}: {
  className?: string;
  count: React.ReactNode;
  href: string;
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <Link className={`arena-link-card surface block p-6 ${className}`} href={href}>
      <div className="flex items-start justify-between gap-4">
        <span className="text-steel">{icon}</span>
        <span className="data-number text-3xl font-black text-ink-950">{count}</span>
      </div>
      <h3 className="mt-8 text-xl font-black text-ink-950">{label}</h3>
      <p className="mt-2 max-w-lg text-sm font-semibold leading-6 text-ink-600">{text}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-clay">
        进入管理
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}
