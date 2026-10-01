import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";
import {
  ArrowRight, BookOpenCheck, CheckCircle2, ClipboardList, History,
  Megaphone, PenLine, Target, Timer, Trophy,
} from "lucide-react";
import { AcademyIllustration, type AcademyIllustrationKind } from "@/components/AcademyIllustration";
import { RankEmblem } from "@/components/RankEmblem";
import { StudentAssignmentReminderModal } from "@/components/StudentAssignmentReminderModal";
import { RewardsHomeBanner } from "@/components/RewardsPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { requirePageUser } from "@/lib/auth";
import { getStudentLearningReview } from "@/lib/learningReview";
import { prisma } from "@/lib/prisma";
import {
  findRankingByUserId, getRankTierProgress, getStudentRankings,
  type StudentRankingEntry,
} from "@/lib/ranking";
import { getPublicSettings } from "@/lib/settings";
import {
  getAssignmentPublisherLabel, hasIncompleteAssignmentProblems,
  type PendingAssignmentReminderItem,
} from "@/lib/studentAssignmentReminder";

const getStudentHomeAssignments = async (userId: number) => {
  const activeAssignments = await prisma.learningAssignment.findMany({
    where: { studentId: userId, status: "active" },
    include: {
      createdBy: { select: { role: true, username: true } },
      problems: { select: { completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const pendingAssignments = activeAssignments.filter((assignment) =>
    hasIncompleteAssignmentProblems(assignment.problems),
  );
  const reminderItems: PendingAssignmentReminderItem[] = pendingAssignments.map(
    (assignment) => ({
      completedCount: assignment.problems.filter((problem) => problem.completedAt).length,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      id: assignment.id,
      problemCount: assignment.problems.length,
      publisherLabel: getAssignmentPublisherLabel(assignment.createdBy),
      title: assignment.title,
      updatedAt: assignment.updatedAt.toISOString(),
    }),
  );
  const recentAssignment = pendingAssignments[0] ?? activeAssignments[0] ?? null;
  return {
    pendingCount: pendingAssignments.length,
    recentAssignment,
    recentAssignmentCompleted: recentAssignment
      ? recentAssignment.problems.filter((problem) => problem.completedAt).length : 0,
    reminderItems,
  };
};

export default async function StudentHomePage() {
  const user = await requirePageUser("student");
  const [
    problemCount, examCount, dailySubmissionCount, examSubmissionCount,
    acceptedCount, settings, assignmentData, currentRanking, learningReview, recentSubmissions,
  ] = await Promise.all([
    prisma.problem.count({ where: { archivedAt: null } }),
    prisma.exam.count({ where: { status: "published" } }),
    prisma.submission.count({ where: { userId: user.id, submissionType: "practice" } }),
    prisma.submission.count({ where: { userId: user.id, submissionType: "exam" } }),
    prisma.submission.count({ where: { userId: user.id, status: "Accepted" } }),
    getPublicSettings(),
    getStudentHomeAssignments(user.id),
    getStudentRankings().then((rankings) => findRankingByUserId(rankings, user.id)),
    getStudentLearningReview(user.id),
    prisma.submission.findMany({
      where: { userId: user.id },
      select: {
        id: true, status: true, submissionType: true, createdAt: true,
        problem: { select: { title: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    }),
  ]);

  return (
    <>
      <StudentAssignmentReminderModal assignments={assignmentData.reminderItems} studentId={user.id} />
      <section className="academy-welcome">
        <div>
          <p className="arena-kicker">Today&apos;s Mission</p>
          <PageHeading kind="home" size="hero" className="mt-2 tracking-tight text-ink-950">今天，向前一步。</PageHeading>
          <p className="mt-2 text-sm leading-6 text-ink-600">一道新题，一点进步。选择适合你的节奏，继续今天的训练。</p>
        </div>
        <span className="academy-resource-count"><Target aria-hidden="true" size={16} />{problemCount} 道题可挑战</span>
      </section>

      <section className="academy-notice">
        <Megaphone aria-hidden="true" className="flex-none text-clay" size={17} />
        <span className="min-w-0 break-words">{settings.studentNotice}</span>
      </section>

      <section aria-label="今日训练与段位" className="academy-focus-grid">
        <StudentAssignmentOverview assignmentData={assignmentData} />
        <StudentRankProgress currentRanking={currentRanking} />
      </section>

      <section aria-label="我的训练统计" className="academy-stat-strip surface">
        <StatItem icon={<History size={18} />} label="日常提交" value={dailySubmissionCount} />
        <StatItem icon={<Timer size={18} />} label="考试提交" value={examSubmissionCount} />
        <StatItem icon={<BookOpenCheck size={18} />} label="Accepted 次数" value={acceptedCount} />
        <StatItem icon={<Trophy size={18} />} label="唯一通过题目" value={currentRanking?.acCount ?? 0} />
      </section>

      <RewardsHomeBanner />

      <section className="academy-training">
        <div className="academy-section-heading">
          <h2 className="text-lg font-bold text-ink-950">选择今天的训练</h2>
          <span className="text-xs text-ink-600">每一步，都在积累</span>
        </div>
        <div className="academy-feature-grid">
          <HomeLink href="/student/problems" kind="practice" title="日常刷题" text="按知识分类练习，在解题中巩固基础。" meta={`${problemCount} 道题可挑战`} />
          <HomeLink href="/student/exams" kind="exam" title="模拟考试" text="在规定时间内，检验阶段学习成果。" meta={`${examCount} 场考试已发布`} />
          <HomeLink href="/student/assignments" kind="assignment" title="专项练习" text="跟随老师的安排，集中攻克薄弱点。" meta={assignmentData.pendingCount ? `${assignmentData.pendingCount} 份任务待完成` : "查看我的专项任务"} />
          <HomeLink href="/student/rewards" kind="reward" title="我的奖励" text="首次通过新题，领取积分与翻倍机会。" meta="查看奖励与挑战" />
        </div>
      </section>

      <section className="academy-bottom-grid">
        <div className="surface academy-review-panel">
          <div className="academy-section-heading">
            <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpenCheck aria-hidden="true" className="text-steel" size={19} />复盘与提升</h2>
            <Link className="academy-text-link" href="/student/review">打开错题本 <ArrowRight aria-hidden="true" size={14} /></Link>
          </div>
          <p className="text-sm leading-6 text-ink-600">
            {learningReview.summary.pendingProblemCount
              ? `还有 ${learningReview.summary.pendingProblemCount} 道错题待攻克，给熟悉的知识点一次新的尝试。`
              : "目前没有待攻克错题，继续挑战新题，保持训练节奏。"}
          </p>
          <div className="academy-review-stats">
            <span><strong>{learningReview.summary.pendingProblemCount}</strong>待攻克错题</span>
            <span><strong>{learningReview.summary.conqueredProblemCount}</strong>已攻克错题</span>
          </div>
          <Link className="academy-review-link" href="/student/leaderboard">
            <span className="flex items-center gap-2"><Trophy aria-hidden="true" className="text-clay" size={17} />天梯竞技场</span>
            <span className="flex items-center gap-2 text-xs text-ink-600">{currentRanking ? `当前第 ${currentRanking.rank} 名` : "查看天梯排名"}<ArrowRight aria-hidden="true" size={15} /></span>
          </Link>
        </div>
        <div className="surface academy-recent-panel">
          <div className="academy-section-heading">
            <h2 className="flex items-center gap-2 text-lg font-bold"><History aria-hidden="true" className="text-steel" size={19} />最近提交</h2>
            <Link className="academy-text-link" href="/student/submissions">全部记录 <ArrowRight aria-hidden="true" size={14} /></Link>
          </div>
          {recentSubmissions.length ? (
            <ul className="academy-recent-list">
              {recentSubmissions.map((submission) => (
                <li key={submission.id}>
                  <Link className="academy-recent-link" href={`/student/submissions/${submission.id}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold" title={submission.problem.title}>{submission.problem.title}</span>
                      <span className="mt-1 block text-xs text-ink-600">{submission.submissionType === "exam" ? "考试" : "日常"} · {formatHomeDate(submission.createdAt)}</span>
                    </span>
                    <StatusBadge status={submission.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="academy-small-empty">
              <PenLine aria-hidden="true" className="text-steel" size={25} strokeWidth={1.5} />
              <p className="mt-2 text-sm text-ink-600">从一道题开始，记录你的第一份解答。</p>
              <Link className="academy-text-link mt-3" href="/student/problems">开始日常刷题 <ArrowRight aria-hidden="true" size={14} /></Link>
            </div>
          )}
          <Link className="academy-text-link mt-3" href="/student/exam-submissions">查看考试提交记录 <ArrowRight aria-hidden="true" size={14} /></Link>
        </div>
      </section>
    </>
  );
}

function StudentAssignmentOverview({ assignmentData }: {
  assignmentData: Awaited<ReturnType<typeof getStudentHomeAssignments>>;
}) {
  const { recentAssignment, recentAssignmentCompleted, pendingCount } = assignmentData;
  const total = recentAssignment?.problems.length ?? 0;
  const percent = total ? Math.round(recentAssignmentCompleted / total * 100) : 0;
  const hasPending = pendingCount > 0;

  return (
    <div className="surface academy-task-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-steel"><ClipboardList aria-hidden="true" size={17} />{recentAssignment ? "老师布置的专项练习" : "今日训练"}</p>
        <span className={`academy-task-state ${recentAssignment && !hasPending ? "is-complete" : ""}`}>
          {recentAssignment && !hasPending ? <CheckCircle2 aria-hidden="true" size={13} /> : <span className="academy-state-dot" />}
          {hasPending ? "待完成" : recentAssignment ? "已完成" : "准备出发"}
        </span>
      </div>
      <h2 className="mt-4 break-words text-xl font-bold leading-7 text-ink-950">{recentAssignment?.title ?? "从一道新题，开启今天的进步。"}</h2>
      <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-ink-600">
        {recentAssignment?.note || (recentAssignment ? "从专项任务进入题目并重新通过，让每一次练习都计入进度。" : "目前没有专项任务。可以先练习基础知识，也可以参加模拟考试。")}
      </p>
      {recentAssignment ? (
        <div className="mt-5">
          <div className="mb-2 flex justify-between gap-3 text-xs text-ink-600">
            <span>训练进度 <strong className="ml-1 font-semibold text-ink-950">{recentAssignmentCompleted} / {total} 题</strong></span>
            <span className="data-number font-semibold text-steel">{percent}%</span>
          </div>
          <div aria-label="专项练习完成进度" aria-valuemax={total} aria-valuemin={0} aria-valuenow={recentAssignmentCompleted} className="academy-progress-track" role="progressbar">
            <div className="academy-progress-value" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}
      <div className="academy-task-footer">
        <span className="text-xs leading-5 text-ink-600">{recentAssignment?.dueAt ? `截止 ${formatHomeDate(recentAssignment.dueAt)}` : hasPending ? `共 ${pendingCount} 份任务待完成` : "每道首次通过的新题，积累 10 天梯积分"}</span>
        <Link className="btn btn-primary" href={hasPending && recentAssignment ? `/student/assignments/${recentAssignment.id}` : "/student/problems"}>
          {hasPending ? "继续专项练习" : "开始今日刷题"}<ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </div>
  );
}

function StudentRankProgress({ currentRanking }: { currentRanking: StudentRankingEntry | null }) {
  const progress = currentRanking ? getRankTierProgress(currentRanking.points) : null;
  return (
    <div className="academy-rank-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-[#c8c9b9]">我的段位</span>
        <Link className="academy-rank-link" href="/student/leaderboard">查看排名 <ArrowRight aria-hidden="true" size={14} /></Link>
      </div>
      {currentRanking && progress ? (
        <>
          <div className="academy-rank-identity">
            <RankEmblem tierTitle={currentRanking.tierTitle} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold" title={currentRanking.displayTitle}>{currentRanking.displayTitle}</h2>
              <p className="mt-1 text-xs text-[#c8c9b9]">{currentRanking.tierTitle} · 唯一 AC {currentRanking.acCount} 题</p>
            </div>
            <span className="data-number text-2xl font-bold text-[#f2d28c]">#{currentRanking.rank}</span>
          </div>
          <div className="academy-rank-points"><strong className="data-number">{currentRanking.points}</strong><span>天梯积分</span></div>
          <div aria-label="当前段位进度" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress.progressPercent} className="academy-progress-track is-dark" role="progressbar">
            <div className="academy-progress-value" style={{ width: `${progress.progressPercent}%` }} />
          </div>
          <p className="mt-2 text-xs leading-5 text-[#c8c9b9]">{progress.isMaxTier ? "已达最高段位，继续训练，保持进步。" : `距 ${progress.nextTierTitle} 还差 ${progress.pointsToNextTier} 积分`}</p>
        </>
      ) : (
        <div className="py-4">
          <Trophy aria-hidden="true" className="mb-4 text-[#f2d28c]" size={30} />
          <h2 className="text-lg font-bold">完成第一道新题，开启天梯。</h2>
          <p className="mt-2 text-sm leading-6 text-[#c8c9b9]">首次通过可获得 10 积分，记录每一次进步。</p>
        </div>
      )}
    </div>
  );
}

function HomeLink({ href, kind, title, text, meta }: {
  href: string; kind: AcademyIllustrationKind; title: string; text: string; meta: string;
}) {
  return (
    <Link className="academy-feature-card arena-link-card surface" href={href}>
      <AcademyIllustration eager kind={kind} />
      <h3 className="mt-3 text-lg font-bold text-ink-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-600">{text}</p>
      <span className="academy-feature-footer"><span>{meta}</span><ArrowRight aria-hidden="true" className="academy-card-arrow" size={16} /></span>
    </Link>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="academy-stat-item">
      <span aria-hidden="true" className="academy-stat-icon">{icon}</span>
      <span><span className="data-number block text-xl font-bold text-ink-950">{value}</span><span className="mt-0.5 block text-xs text-ink-600">{label}</span></span>
    </div>
  );
}

function formatHomeDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(value);
}
