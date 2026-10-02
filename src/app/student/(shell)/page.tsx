import { ArrowRight, ChevronDown, Megaphone } from "lucide-react";
import { NavigationLink } from "@/components/NavigationLink";
import { PageHeading } from "@/components/PageHeading";
import { RankEmblem } from "@/components/RankEmblem";
import { StudentAssignmentReminderModal } from "@/components/StudentAssignmentReminderModal";
import { RewardsHomeBanner } from "@/components/RewardsPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { UiIcon, type UiIconKind } from "@/components/UiIcon";
import { requirePageUser } from "@/lib/auth";
import { getStudentLearningReview } from "@/lib/learningReview";
import { prisma } from "@/lib/prisma";
import { findRankingByUserId, getRankTierProgress, getStudentRankings, type StudentRankingEntry } from "@/lib/ranking";
import { getPublicSettings } from "@/lib/settings";
import { getLadderSettingsForRender } from "@/lib/ladderSettings";
import type { RankTier } from "@/lib/ladderShared";
import { getAssignmentPublisherLabel, hasIncompleteAssignmentProblems, type PendingAssignmentReminderItem } from "@/lib/studentAssignmentReminder";

const getStudentHomeAssignments = async (userId: number) => {
  const activeAssignments = await prisma.learningAssignment.findMany({
    where: { studentId: userId, status: "active" },
    include: { createdBy: { select: { role: true, username: true } }, problems: { select: { completedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const pending = activeAssignments.filter((assignment) => hasIncompleteAssignmentProblems(assignment.problems));
  const reminderItems: PendingAssignmentReminderItem[] = pending.map((assignment) => ({
    completedCount: assignment.problems.filter((problem) => problem.completedAt).length,
    dueAt: assignment.dueAt?.toISOString() ?? null,
    id: assignment.id,
    problemCount: assignment.problems.length,
    publisherLabel: getAssignmentPublisherLabel(assignment.createdBy),
    title: assignment.title,
    updatedAt: assignment.updatedAt.toISOString(),
  }));
  return { pendingCount: pending.length, recentAssignment: pending[0] ?? null, reminderItems };
};

export default async function StudentHomePage() {
  const user = await requirePageUser("student");
  const ladderSettings = await getLadderSettingsForRender();
  const [problemCount, examCount, settings, assignmentData, rankings, learningReview, recentSubmissions] = await Promise.all([
    prisma.problem.count({ where: { archivedAt: null } }),
    prisma.exam.count({ where: { status: "published" } }),
    getPublicSettings(),
    getStudentHomeAssignments(user.id),
    getStudentRankings(undefined, ladderSettings.tiers),
    getStudentLearningReview(user.id),
    prisma.submission.findMany({
      where: { userId: user.id },
      select: { id: true, status: true, submissionType: true, createdAt: true, problem: { select: { title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
    }),
  ]);
  const currentRanking = findRankingByUserId(rankings, user.id);
  const latest = recentSubmissions[0];
  return (
    <>
      <StudentAssignmentReminderModal assignments={assignmentData.reminderItems} studentId={user.id} />
      <section aria-label="今日挑战与天梯前三名" className="training-home-grid">
        <StudentChallenge currentRanking={currentRanking} problemCount={problemCount} tiers={ladderSettings.tiers} />
        <HomePodium currentUserId={user.id} rankings={rankings.slice(0, 3)} />
      </section>
      <HomeNotice text={settings.studentNotice} />
      {assignmentData.recentAssignment ? <PendingAssignment assignmentData={assignmentData} /> : null}
      <RewardsHomeBanner />
      <section aria-label="更多训练入口" className="training-shortcuts surface">
        <HomeQuickLink href="/student/exams" kind="exam" meta={`${examCount} 场已发布`} title="模拟考试" />
        <HomeQuickLink href="/student/review" kind="review" meta={learningReview.summary.pendingProblemCount ? `${learningReview.summary.pendingProblemCount} 道待攻克` : "复盘，积累进步"} title="错题本" />
        <HomeQuickLink href="/student/rewards" kind="reward" meta="领取新题奖励" title="我的奖励" />
        <HomeQuickLink href="/student/submissions" kind="submission" meta="查看解题记录" title="最近提交" />
      </section>
      <div className="training-footer">
        <NavigationLink href="/student/assignments"><UiIcon kind="assignment" size={15} />我的专项练习</NavigationLink>
        <NavigationLink href="/student/exam-submissions">考试提交记录<ArrowRight aria-hidden="true" size={14} /></NavigationLink>
      </div>
      {latest ? (
        <NavigationLink className="training-latest" contentAs="div" contentClassName="training-latest-content" href={`/student/submissions/${latest.id}`}>
          <UiIcon kind="submission" size={16} />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold" title={latest.problem.title}>{latest.problem.title}</span><span className="text-xs text-ink-600">最近一次 · {latest.submissionType === "exam" ? "考试" : "日常"} · {formatHomeDate(latest.createdAt)}</span></span>
          <StatusBadge status={latest.status} /><ArrowRight aria-hidden="true" size={15} />
        </NavigationLink>
      ) : null}
    </>
  );
}

function StudentChallenge({ currentRanking, problemCount, tiers }: { currentRanking: StudentRankingEntry | null; problemCount: number; tiers: readonly RankTier[] }) {
  const progress = currentRanking ? getRankTierProgress(currentRanking.points, tiers) : null;
  return (
    <div className="training-challenge">
      <div className="training-challenge-heading">
        <p className="arena-kicker">One More Challenge</p>
        <PageHeading className="mt-3" size="hero">今天，挑战下一段位。</PageHeading>
        <p className="training-challenge-intro">从一道新题开始，让进步看得见。</p>
      </div>
      <div className="training-rank-identity">
        <NavigationLink aria-label="查看我的天梯段位与排名" className="training-emblem-link" href="/student/leaderboard">
          <RankEmblem className="rank-emblem-home" eager tierTitle={currentRanking?.tierTitle ?? "青铜学徒"} />
        </NavigationLink>
        <div className="training-rank-copy">
          <p className="training-rank-eyebrow">我的段位</p>
          <h2>{currentRanking?.tierTitle ?? "青铜学徒"}</h2>
          {currentRanking?.customTitle ? <p className="training-custom-title" title={currentRanking.customTitle}>{currentRanking.customTitle}</p> : null}
          <div className="training-rank-stats">
            <span><strong className="data-number">{currentRanking?.points ?? "—"}</strong>积分</span>
            <span><strong className="data-number">{currentRanking ? `#${currentRanking.rank}` : "—"}</strong>排名</span>
            <span><strong className="data-number">{currentRanking?.acCount ?? "—"}</strong>通过题数</span>
          </div>
        </div>
      </div>
      <div className="training-tier-target">
        <p>{progress ? progress.isMaxTier ? "已达荣耀王者，继续刷新你的战绩。" : <>距离 <strong>{progress.nextTierTitle}</strong> 还差 <strong className="data-number">{progress.pointsToNextTier}</strong> 分</> : "通过第一道新题，积累 10 天梯积分。"}</p>
        {progress ? <div aria-label="当前段位进度" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress.progressPercent} className="training-tier-track" role="progressbar"><span style={{ width: `${progress.progressPercent}%` }} /></div> : null}
      </div>
      <div className="training-challenge-footer">
        <NavigationLink className="btn training-start-button" href="/student/problems">开始刷题<ArrowRight aria-hidden="true" size={19} /></NavigationLink>
        <span>{problemCount} 道题，等你挑战</span>
      </div>
    </div>
  );
}

function HomePodium({ currentUserId, rankings }: { currentUserId: number; rankings: StudentRankingEntry[] }) {
  return (
    <div className="surface training-home-podium">
      <div className="flex items-center justify-between gap-2"><PageHeading as="h2" kind="leaderboard" size="section">天梯前三名</PageHeading><span className="training-podium-caption">向高手看齐</span></div>
      {rankings.length ? <ol className="training-podium-list">
        {rankings.map((entry) => <li className="training-podium-entry" data-place={entry.rank} key={entry.userId}>
          <span className="training-podium-place data-number">{String(entry.rank).padStart(2, "0")}</span>
          <RankEmblem className="rank-emblem-home-podium" eager tierTitle={entry.tierTitle} />
          <span className="min-w-0 flex-1"><span className="block truncate font-bold" title={entry.username}>{entry.username}{entry.userId === currentUserId ? " · 我" : ""}</span><span className="mt-1 block text-xs text-ink-600">{entry.tierTitle}</span></span>
          <span className="training-podium-points"><strong className="data-number">{entry.points}</strong><span>积分</span></span>
        </li>)}
      </ol> : <p className="training-podium-empty">天梯等待第一位挑战者。<br />从第一道题，开启你的战绩。</p>}
      <NavigationLink className="training-full-ladder" href="/student/leaderboard">查看完整天梯<ArrowRight aria-hidden="true" size={16} /></NavigationLink>
    </div>
  );
}

function HomeNotice({ text }: { text: string }) {
  const value = text.trim();
  if (!value) return null;
  const characters = Array.from(value);
  const expanded = characters.length > 50 || /[\r\n]/.test(value);
  return <section aria-label="首页公告" className="training-notice"><Megaphone aria-hidden="true" size={17} />{expanded ? <details><summary><span className="training-notice-preview">{characters.slice(0, 50).join("").replace(/[\r\n]+/g, " ")}{characters.length > 50 ? "…" : ""}</span><span className="training-notice-expand">展开</span><span className="training-notice-collapse">收起</span><ChevronDown aria-hidden="true" size={14} /></summary><p>{value}</p></details> : <p>{value}</p>}</section>;
}

function PendingAssignment({ assignmentData }: { assignmentData: Awaited<ReturnType<typeof getStudentHomeAssignments>> }) {
  const assignment = assignmentData.recentAssignment;
  if (!assignment) return null;
  const completed = assignment.problems.filter((problem) => problem.completedAt).length;
  const total = assignment.problems.length;
  return <section className="surface training-assignment" aria-labelledby="home-assignment-heading">
    <UiIcon className="text-steel" kind="assignment" size={26} />
    <div className="min-w-0 flex-1"><p className="text-xs font-medium text-steel">老师布置的任务 · {assignmentData.pendingCount} 份待完成</p><PageHeading as="h2" className="mt-1" id="home-assignment-heading" size="section">{assignment.title}</PageHeading>{assignment.dueAt ? <p className="mt-1 text-xs text-ink-600">截止 {formatHomeDate(assignment.dueAt)}</p> : null}</div>
    <div className="training-assignment-progress"><span>已完成 <strong className="data-number">{completed} / {total}</strong> 题</span><div aria-label="专项练习完成进度" aria-valuemax={total} aria-valuemin={0} aria-valuenow={completed} className="academy-progress-track" role="progressbar"><div className="academy-progress-value" style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div></div>
    <NavigationLink className="btn btn-primary" href={`/student/assignments/${assignment.id}`}>继续练习<ArrowRight aria-hidden="true" size={16} /></NavigationLink>
  </section>;
}

function HomeQuickLink({ href, kind, meta, title }: { href: string; kind: UiIconKind; meta: string; title: string }) {
  return <NavigationLink className="training-quick-link" contentAs="div" contentClassName="training-quick-content" href={href}><UiIcon kind={kind} size={23} /><span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="mt-1 block text-xs text-ink-600">{meta}</span></span><ArrowRight aria-hidden="true" className="training-quick-arrow" size={16} /></NavigationLink>;
}

function formatHomeDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}
