// Shared server page for administrator and teacher shells.
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
  BrainCircuit,
  ClipboardList,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { getStudentRankings } from "@/lib/ranking";
import { getAdminDisplaySettings } from "@/lib/settings";
import {
  getExamAccessWhere,
  getStaffSubmissionWhere,
  getStaffBasePath,
  getStaffNav,
  getStaffTitle,
  requireStaffPageUser,
  type StaffRole,
} from "@/lib/staffAccess";

export async function StaffHomePage({ role }: { role: StaffRole }) {
  const user = await requireStaffPageUser(role);
  const basePath = getStaffBasePath(role);
  const [
    problemCount,
    examCount,
    userCount,
    dailySubmissionCount,
    examSubmissionCount,
    rankings,
    settings,
  ] = await Promise.all([
    prisma.problem.count({ where: { archivedAt: null } }),
    prisma.exam.count({ where: getExamAccessWhere(user) }),
    prisma.user.count({ where: role === "teacher" ? { role: "student" } : undefined }),
    prisma.submission.count({
      where: {
        AND: [
          { submissionType: "practice" },
          getStaffSubmissionWhere(user),
        ],
      },
    }),
    prisma.submission.count({
      where: {
        AND: [
          { submissionType: "exam" },
          getStaffSubmissionWhere(user),
        ],
      },
    }),
    getStudentRankings(),
    getAdminDisplaySettings(),
  ]);

  return (
    <AppShell nav={getStaffNav(role)} title={getStaffTitle(role)} user={user}>
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
            {role === "admin" ? (
              <Link className="btn border-[#d6a44a]/35 bg-[#d6a44a]/10 text-[#f2d28c]" href="/admin/settings">
                <Settings size={17} />
                系统设置
              </Link>
            ) : null}
          </div>
        </div>
        <div className="grid bg-white/45 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat label="题库题目" value={problemCount} />
          <OverviewStat label={role === "admin" ? "模拟考试" : "我的考试"} value={examCount} />
          <OverviewStat label={role === "admin" ? "系统用户" : "学生账号"} value={userCount} />
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
            href={`${basePath}/practice`}
            icon={<PenLine size={23} />}
            label="题目练习"
            text={`以${role === "admin" ? "管理员" : "老师"}身份校题并测试 Judge 流程`}
          />
          {role === "admin" ? (
            <AdminEntry
              className="lg:col-span-4"
              count={problemCount}
              href="/admin/problems"
              icon={<FileText size={23} />}
              label="题目管理"
              text="新增、编辑、删除与 Markdown 批量导入"
            />
          ) : null}
          <AdminEntry
            className="lg:col-span-4"
            count={examCount}
            href={`${basePath}/exams`}
            icon={<GraduationCap size={23} />}
            label="模拟考试管理"
            text={`创建、组卷、发布并进入${role === "admin" ? "管理员" : "老师"}练习模式`}
          />
          <AdminEntry
            className="lg:col-span-4"
            count={userCount}
            href={`${basePath}/users`}
            icon={<Users size={23} />}
            label={role === "admin" ? "用户与头衔管理" : "学生与头衔管理"}
            text={
              role === "admin"
                ? "维护学生、老师和管理员账号，设置学生自定义头衔"
                : "新增学生、调整个人 AI 权限并重置初始密码"
            }
          />
          <AdminEntry
            className="lg:col-span-4"
            count="批量"
            href={`${basePath}/assignments`}
            icon={<ClipboardList size={23} />}
            label="作业发布"
            text="批量选择学生，共用题单并完成每个人的个性化调整"
          />
          <AdminEntry
            className="lg:col-span-4"
            count="学情"
            href={`${basePath}/learning`}
            icon={<Activity size={23} />}
            label="教师学情看板"
            text="识别学生困难，确认并下发数据库中的专项练习"
          />
          <AdminEntry
            className="lg:col-span-4"
            count="AI"
            href={`${basePath}/ai-usage`}
            icon={<BrainCircuit size={23} />}
            label="AI 使用与对话"
            text="查看学生使用次数、调用消耗和与 AI 的具体问答"
          />
          <AdminEntry
            className="lg:col-span-4"
            count={rankings.length}
            href={`${basePath}/leaderboard`}
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
              href={`${basePath}/submissions`}
              icon={<History size={22} />}
              label="日常提交"
              text="查看学生日常刷题产生的评测记录"
            />
            <AdminEntry
              count={examSubmissionCount}
              href={`${basePath}/exam-submissions`}
              icon={<GraduationCap size={22} />}
              label="考试提交"
              text="查看绑定模拟考试的学生提交记录"
            />
          </div>
        </div>
        {role === "admin" ? <div>
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
        </div> : null}
      </section>
    </AppShell>
  );
}

export default function AdminHomePage() {
  return <StaffHomePage role="admin" />;
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
