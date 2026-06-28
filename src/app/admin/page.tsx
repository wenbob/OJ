import Link from "next/link";
import {
  FileText,
  GraduationCap,
  History,
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
      <section className="mb-6 border border-clay/25 bg-white/70 p-4 text-sm font-semibold text-ink-700">
        {settings.adminNotice}
      </section>
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <AdminEntry
          count={problemCount}
          href="/admin/practice"
          icon={<PenLine size={22} />}
          label="题目练习"
          text="以管理员身份测试题目和 Judge 流程"
        />
        <AdminEntry
          count={problemCount}
          href="/admin/problems"
          icon={<FileText size={22} />}
          label="题目管理"
          text="新增、编辑、删除与 Markdown 导入"
        />
        <AdminEntry
          count={examCount}
          href="/admin/exams"
          icon={<GraduationCap size={22} />}
          label="模拟考试管理"
          text="创建考试、发布考试、添加考试题目"
        />
        <AdminEntry
          count={userCount}
          href="/admin/users"
          icon={<Users size={22} />}
          label="用户管理"
          text="学生账号、管理员账号与密码重置"
        />
        <AdminEntry
          count={rankings.length}
          href="/admin/leaderboard"
          icon={<Trophy size={22} />}
          label="天梯排行榜"
          text="查看学生段位积分并管理自定义头衔"
        />
        <AdminEntry
          count={dailySubmissionCount}
          href="/admin/submissions"
          icon={<History size={22} />}
          label="日常提交记录"
          text="查看日常刷题产生的提交"
        />
        <AdminEntry
          count={examSubmissionCount}
          href="/admin/exam-submissions"
          icon={<GraduationCap size={22} />}
          label="考试提交记录"
          text="查看绑定考试的模拟考试提交"
        />
        <AdminEntry
          count="配置"
          href="/admin/settings"
          icon={<Settings size={22} />}
          label="系统设置"
          text="维护平台名称、公告、代码模板和默认评测限制"
        />
      </section>
    </AppShell>
  );
}

function AdminEntry({
  count,
  href,
  icon,
  label,
  text,
}: {
  count: React.ReactNode;
  href: string;
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <Link className="surface block p-6 hover:border-steel" href={href}>
      <div className="text-steel">{icon}</div>
      <p className="mt-5 text-4xl font-black">{count}</p>
      <h2 className="mt-2 text-xl font-black">{label}</h2>
      <p className="mt-2 text-sm font-semibold text-ink-600">{text}</p>
    </Link>
  );
}
