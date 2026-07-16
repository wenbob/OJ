import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  History,
  Megaphone,
  PenLine,
  Target,
  Timer,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RankEmblem } from "@/components/RankEmblem";
import { requirePageUser } from "@/lib/auth";
import { getStudentLearningReview } from "@/lib/learningReview";
import { prisma } from "@/lib/prisma";
import {
  findRankingByUserId,
  getRankTierProgress,
  getStudentRankings,
  type RankTierProgress,
  type StudentRankingEntry,
} from "@/lib/ranking";
import { getPublicSettings } from "@/lib/settings";

type ProgressStyle = CSSProperties & { "--progress": number };

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
    learningReview,
    activeAssignments,
  ] = await Promise.all([
    prisma.problem.count({ where: { archivedAt: null } }),
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
    getStudentLearningReview(user.id),
    prisma.learningAssignment.findMany({
      where: { studentId: user.id, status: "active" },
      include: { problems: { select: { completedAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const currentRanking = findRankingByUserId(rankings, user.id);
  const rankProgress = currentRanking
    ? getRankTierProgress(currentRanking.points)
    : null;
  const pendingAssignments = activeAssignments.filter(
    (assignment) =>
      assignment.problems.length > 0 &&
      assignment.problems.some((problem) => !problem.completedAt),
  );
  const recentAssignment = pendingAssignments[0] ?? activeAssignments[0] ?? null;
  const recentAssignmentCompleted = recentAssignment
    ? recentAssignment.problems.filter((problem) => problem.completedAt).length
    : 0;

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      <section className="mb-6 flex items-start gap-3 border border-clay/25 bg-[#fffaf1] p-4 text-sm font-semibold leading-6 text-ink-700">
        <Megaphone aria-hidden="true" className="mt-0.5 flex-none text-clay" size={18} />
        <span>{settings.studentNotice}</span>
      </section>

      <section className="surface overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden p-6 md:p-10">
            <div className="absolute -left-24 top-20 h-48 w-48 rounded-full border-[34px] border-clay/5" />
            <div className="relative">
              <p className="arena-kicker">Today&apos;s Mission</p>
              <div className="arena-rule mt-3" />
              <h1 className="mt-6 max-w-3xl text-3xl font-black leading-tight tracking-tight text-ink-950 md:text-5xl">
                今天，拿下一道新题。
                <span className="mt-2 block text-steel">让段位向前一步。</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-ink-600">
                日常刷题适合稳步训练，模拟考试适合检验阶段成果。每道首次通过的新题都会计入天梯积分。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="btn btn-primary" href="/student/problems">
                  <PenLine size={17} />
                  开始今日刷题
                  <ArrowRight size={16} />
                </Link>
                <Link className="btn btn-secondary" href="/student/exams">
                  <Timer size={17} />
                  进入模拟考试
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-950/10 pt-5 text-sm font-bold text-ink-600">
                <span className="flex items-center gap-2">
                  <Target className="text-clay" size={16} />
                  {problemCount} 道题可挑战
                </span>
                <span className="flex items-center gap-2">
                  <BookOpenCheck className="text-steel" size={16} />
                  {examCount} 场考试已发布
                </span>
              </div>
            </div>
          </div>

          {currentRanking && rankProgress ? (
            <RankProgressPanel
              currentRanking={currentRanking}
              rankProgress={rankProgress}
            />
          ) : (
            <div className="flex min-h-80 flex-col justify-center bg-ink-950 p-7 text-linen md:p-9">
              <Trophy className="text-[#d6a44a]" size={34} />
              <p className="arena-kicker mt-6 text-[#d7a062]">Your Ladder</p>
              <h2 className="mt-2 text-2xl font-black">完成第一道新题，开启天梯。</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#d7d0c2]">
                首次 Accepted 一道题可获得 10 积分，并自动点亮青铜学徒徽章。
              </p>
            </div>
          )}
        </div>

        <div className="grid border-t border-ink-950/10 bg-white/45 sm:grid-cols-2 lg:grid-cols-4">
          <StatItem icon={<History size={19} />} label="日常提交" value={dailySubmissionCount} />
          <StatItem icon={<Timer size={19} />} label="考试提交" value={examSubmissionCount} />
          <StatItem icon={<BookOpenCheck size={19} />} label="Accepted 次数" value={acceptedCount} />
          <StatItem icon={<Trophy size={19} />} label="当前天梯排名" value={currentRanking ? `#${currentRanking.rank}` : "待上榜"} />
        </div>
      </section>

      <section className="surface mt-7 overflow-hidden">
        <div className="grid md:grid-cols-[1fr_auto]">
          <div className="p-5 md:p-6">
            <p className="arena-kicker">Teacher Training</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950">老师布置的专项练习</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink-600">
              {recentAssignment
                ? `${recentAssignment.title} · 已完成 ${recentAssignmentCompleted}/${recentAssignment.problems.length} 题`
                : "目前没有专项任务，继续保持日常训练。"}
            </p>
          </div>
          <Link className="arena-link-card flex min-w-64 items-center justify-between gap-4 border-t border-ink-950/10 px-5 py-4 md:border-l md:border-t-0" href="/student/assignments">
            <span>
              <span className="data-number block text-3xl font-black text-steel">{pendingAssignments.length}</span>
              <span className="mt-1 block text-xs font-bold text-ink-600">份任务待完成</span>
            </span>
            <ArrowRight className="text-clay" size={20} />
          </Link>
        </div>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="arena-kicker">Training Ground</p>
              <h2 className="mt-1 text-2xl font-black text-ink-950">训练与考试</h2>
            </div>
            <span className="text-xs font-bold text-ink-600">选择今天最适合你的节奏</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <HomeLink
              href="/student/problems"
              icon={<PenLine size={22} />}
              text="按分类训练基础语法、条件判断、数组与字符串。"
              title="日常刷题"
            />
            <HomeLink
              href="/student/exams"
              icon={<Timer size={22} />}
              text="进入已发布考试，在规定时间内完成阶段挑战。"
              title="模拟考试"
            />
          </div>
        </div>

        <div>
          <div className="mb-4">
            <p className="arena-kicker">Review & Ladder</p>
            <h2 className="mt-1 text-2xl font-black text-ink-950">复盘与排名</h2>
          </div>
          <div className="grid gap-3">
            <CompactLink
              href="/student/assignments"
              label="专项练习"
              meta={`${pendingAssignments.length} 份待完成`}
            />
            <CompactLink
              href="/student/review"
              label="错题本与薄弱知识点"
              meta={
                learningReview.summary.pendingProblemCount > 0
                  ? `${learningReview.summary.pendingProblemCount} 道待攻克`
                  : "当前没有待攻克错题"
              }
            />
            <CompactLink href="/student/submissions" label="日常提交记录" meta={`${dailySubmissionCount} 次提交`} />
            <CompactLink href="/student/exam-submissions" label="考试提交记录" meta={`${examSubmissionCount} 次提交`} />
            <CompactLink href="/student/leaderboard" label="天梯竞技场" meta={currentRanking ? `当前第 ${currentRanking.rank} 名` : "等待首次上榜"} />
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function RankProgressPanel({
  currentRanking,
  rankProgress,
}: {
  currentRanking: StudentRankingEntry;
  rankProgress: RankTierProgress;
}) {
  return (
    <div className="relative overflow-hidden bg-ink-950 p-7 text-linen md:p-9">
      <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full border-[25px] border-white/5" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <RankEmblem tierTitle={currentRanking.tierTitle} />
          <div className="text-right">
            <p className="data-number text-4xl font-black text-[#f2d28c]">#{currentRanking.rank}</p>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#bdb5a7]">Current Rank</p>
          </div>
        </div>
        <p className="arena-kicker mt-7 text-[#d7a062]">My Rank</p>
        <h2 className="mt-2 truncate text-3xl font-black" title={currentRanking.displayTitle}>
          {currentRanking.displayTitle}
        </h2>
        <p className="mt-2 text-sm font-bold text-[#d7d0c2]">
          {currentRanking.tierTitle} · 唯一 AC {currentRanking.acCount} 题
        </p>

        <div className="mt-7 border-y border-white/10 py-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#bdb5a7]">Tier Progress</p>
              <p className="mt-1 text-base font-black text-[#fff7e7]">
                {rankProgress.isMaxTier
                  ? "最高段位 · 继续守擂"
                  : `距离 ${rankProgress.nextTierTitle} 还差 ${rankProgress.pointsToNextTier} 分`}
              </p>
            </div>
            <p className="data-number text-2xl font-black text-[#f2d28c]">{rankProgress.progressPercent}%</p>
          </div>
          <div
            aria-label="当前段位进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={rankProgress.progressPercent}
            className="mt-3 h-3 overflow-hidden border border-white/15 bg-white/10 p-[2px]"
            role="progressbar"
          >
            <div
              className="progress-fill h-full bg-[#d6a44a]"
              style={{ "--progress": rankProgress.progressPercent / 100 } as ProgressStyle}
            />
          </div>
          <p className="mt-3 text-xs font-bold text-[#bdb5a7]">
            {rankProgress.isMaxTier
              ? `${currentRanking.points} 积分，继续完成唯一 AC 可提升排名。`
              : `再完成 ${rankProgress.acceptedProblemsToNextTier} 道唯一 AC 题即可晋级。`}
          </p>
        </div>

        <Link className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#f2d28c] hover:text-white" href="/student/leaderboard">
          查看完整天梯
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function HomeLink({
  href,
  icon,
  text,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  text: string;
  title: string;
}) {
  return (
    <Link className="arena-link-card surface block min-h-48 p-6" href={href}>
      <div className="text-steel">{icon}</div>
      <h3 className="mt-7 text-xl font-black text-ink-950">{title}</h3>
      <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-ink-600">{text}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-clay">
        进入
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}

function CompactLink({ href, label, meta }: { href: string; label: string; meta: string }) {
  return (
    <Link className="arena-link-card surface flex items-center justify-between gap-4 p-4" href={href}>
      <span>
        <span className="block font-black text-ink-950">{label}</span>
        <span className="mt-1 block text-xs font-bold text-ink-600">{meta}</span>
      </span>
      <ArrowRight className="flex-none text-steel" size={18} />
    </Link>
  );
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-950/10 px-5 py-4 sm:border-r lg:border-b-0">
      <span className="text-steel">{icon}</span>
      <span>
        <span className="data-number block text-xl font-black text-ink-950">{value}</span>
        <span className="block text-xs font-bold text-ink-600">{label}</span>
      </span>
    </div>
  );
}
