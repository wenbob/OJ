import Link from "next/link";
import { ClipboardList, History, PenLine, Timer, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findRankingByUserId, getStudentRankings } from "@/lib/ranking";
import { getPublicSettings } from "@/lib/settings";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

export default async function StudentHomePage() {
  const user = await requirePageUser("student");
  const [
    problemCount,
    examCount,
    dailySubmissionCount,
    examSubmissionCount,
    acceptedCount,
    settings,
    rankings,
  ] = await Promise.all([
    prisma.problem.count(),
    prisma.exam.count({ where: { status: "published" } }),
    prisma.submission.count({
      where: { userId: user.id, submissionType: "practice" },
    }),
    prisma.submission.count({
      where: { userId: user.id, submissionType: "exam" },
    }),
    prisma.submission.count({ where: { userId: user.id, status: "Accepted" } }),
    getPublicSettings(),
    getStudentRankings(),
  ]);
  const currentRanking = findRankingByUserId(rankings, user.id);

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      <section className="mb-6 border border-clay/25 bg-white/70 p-4 text-sm font-semibold text-ink-700">
        {settings.studentNotice}
      </section>
      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="surface p-6">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-clay">
            Practice
          </p>
          <h1 className="mt-3 text-3xl font-black text-ink-950">
            选择日常刷题或模拟考试，提交 C++17 代码。
          </h1>
          <div className="mt-6 grid gap-3 sm:grid-cols-5">
            <StatCard icon={<ClipboardList size={22} />} label="可练习题目" value={problemCount} />
            <StatCard icon={<PenLine size={22} />} label="可参加考试" value={examCount} />
            <StatCard icon={<History size={22} />} label="日常提交" value={dailySubmissionCount} />
            <StatCard icon={<Timer size={22} />} label="考试提交" value={examSubmissionCount} />
            <StatCard icon={<Timer size={22} />} label="通过记录" value={acceptedCount} />
          </div>
          {currentRanking ? (
            <div className="mt-6 border border-clay/30 bg-clay/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
                    My Rank
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-ink-950">
                    {currentRanking.displayTitle}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-ink-600">
                    自动段位 {currentRanking.tierTitle} · 唯一 AC {currentRanking.acCount} 题
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-steel">
                    #{currentRanking.rank}
                  </p>
                  <p className="text-sm font-bold text-ink-600">
                    {currentRanking.points} 积分
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/student/problems">
              <PenLine size={16} />
              日常刷题
            </Link>
            <Link className="btn btn-secondary" href="/student/exams">
              <Timer size={16} />
              模拟考试
            </Link>
            <Link className="btn btn-secondary" href="/student/leaderboard">
              <Trophy size={16} />
              天梯榜
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <HomeLink
            eyebrow="Daily Practice"
            href="/student/problems"
            text="按分类筛选基础语法、条件判断、数组、字符串等题目。"
            title="日常刷题"
          />
          <HomeLink
            eyebrow="Mock Exam"
            href="/student/exams"
            text="进入已发布考试，在考试题单内逐题提交代码。"
            title="模拟考试"
          />
          <HomeLink
            eyebrow="Records"
            href="/student/submissions"
            text="只查看日常刷题产生的提交记录。"
            title="日常提交记录"
          />
          <HomeLink
            eyebrow="Exam Records"
            href="/student/exam-submissions"
            text="只查看模拟考试产生的提交记录。"
            title="考试提交记录"
          />
          <HomeLink
            eyebrow="Ladder"
            href="/student/leaderboard"
            text="查看按唯一 AC 题数计算的段位积分和全站排名。"
            title="天梯排行榜"
          />
        </div>
      </section>
    </AppShell>
  );
}

function HomeLink({
  eyebrow,
  href,
  text,
  title,
}: {
  eyebrow: string;
  href: string;
  text: string;
  title: string;
}) {
  return (
    <Link className="surface block p-5 hover:border-steel" href={href}>
      <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-ink-600">{text}</p>
    </Link>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border border-ink-950/10 bg-white/60 p-4">
      <div className="text-steel">{icon}</div>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="text-sm font-semibold text-ink-600">{label}</p>
    </div>
  );
}
