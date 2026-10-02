import { UiBadge } from "@/components/UiBadge";
import type { CSSProperties } from "react";
import { Award, BookOpenCheck, Crown, Medal, Target, Trophy, Users } from "lucide-react";
import { RankEmblem } from "@/components/RankEmblem";
import { LocateRankingButton } from "@/components/LocateRankingButton";
import { NavigationLink } from "@/components/NavigationLink";
import { PageHeading } from "@/components/PageHeading";
import {
  getRankTierProgress,
  type StudentRankingEntry,
} from "@/lib/ranking";
import type { RankTier } from "@/lib/ladderShared";

type ProgressStyle = CSSProperties & { "--progress": number };
type PodiumStyle = CSSProperties & { "--podium-delay": string };

export function LeaderboardTable({
  currentUserId,
  rankings,
  showAdminColumns = false,
  tiers,
}: {
  currentUserId?: number;
  rankings: StudentRankingEntry[];
  showAdminColumns?: boolean;
  tiers: readonly RankTier[];
}) {
  const currentRanking = rankings.find((entry) => entry.userId === currentUserId);
  const totalPoints = rankings.reduce((sum, entry) => sum + entry.points, 0);
  const totalUniqueAccepted = rankings.reduce((sum, entry) => sum + entry.acCount, 0);
  const topThree = rankings.slice(0, 3);
  const remainingRankings = rankings.slice(3);

  if (rankings.length === 0) {
    return <EmptyLeaderboard />;
  }

  return (
    <div className="ladder-board">
      <div className="ladder-summary">
        <SummaryStat icon={<Users size={18} />} label="上榜学生" value={rankings.length} />
        <SummaryStat icon={<Trophy size={18} />} label="累计积分" value={totalPoints} />
        <SummaryStat icon={<BookOpenCheck size={18} />} label="累计唯一 AC" value={totalUniqueAccepted} />
      </div>

      {currentRanking ? (
        <CurrentBattleCard currentRanking={currentRanking} rankings={rankings} tiers={tiers} />
      ) : null}

      <Podium currentUserId={currentUserId} rankings={topThree} />

      {remainingRankings.length > 0 ? (
        <section aria-labelledby="ranking-list-heading" className="border-t border-ink-950/10">
          <div className="flex flex-wrap items-end justify-between gap-3 bg-white/55 px-5 py-4">
            <div>
              <p className="arena-kicker">Rankings</p>
              <PageHeading as="h2" className="mt-1" id="ranking-list-heading" kind="leaderboard" size="section">
                第四名及以后
              </PageHeading>
            </div>
            <p className="max-w-lg text-xs leading-5 text-ink-600">同分时依次比较唯一 AC、AC 次数、用户名和用户 ID</p>
          </div>
          <MobileRankingCards
            currentUserId={currentUserId}
            rankings={remainingRankings}
            showAdminColumns={showAdminColumns}
          />
          <DesktopRankingTable
            currentUserId={currentUserId}
            rankings={remainingRankings}
            showAdminColumns={showAdminColumns}
          />
        </section>
      ) : null}
    </div>
  );
}

function Podium({ currentUserId, rankings }: { currentUserId?: number; rankings: StudentRankingEntry[] }) {
  return (
    <section aria-label="天梯前三名" className="ladder-podium">
      <p className="ladder-podium-heading">天梯前三名 <span>每一步，都值得被看见</span></p>
      <div className="ladder-podium-grid">
        {rankings.map((entry) => {
          const orderClass =
            entry.rank === 1
              ? "podium-champion order-1 md:order-2"
              : entry.rank === 2
                ? "order-2 md:order-1"
                : "order-3";
          return (
            <div className={orderClass} key={entry.userId}>
              <PodiumCard entry={entry} isCurrentUser={entry.userId === currentUserId} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PodiumCard({ entry, isCurrentUser }: { entry: StudentRankingEntry; isCurrentUser: boolean }) {
  const delay = entry.rank === 1 ? "80ms" : entry.rank === 2 ? "0ms" : "150ms";
  const PlaceIcon = entry.rank === 1 ? Crown : entry.rank === 2 ? Trophy : Medal;

  return (
    <article
      className="podium-card text-center"
      data-ranking-user-id={entry.userId}
      data-place={entry.rank}
      style={{ "--podium-delay": delay } as PodiumStyle}
      tabIndex={-1}
    >
      <span aria-hidden="true" className="podium-shine" />
      <div className="flex items-center justify-between gap-3">
        <span className="data-number text-sm font-black text-ink-600">NO. {entry.rank}</span>
        <PlaceIcon aria-hidden="true" className="text-clay" size={20} />
      </div>
      <RankEmblem className="rank-emblem-podium" eager tierTitle={entry.tierTitle} />
      <h3 className="podium-username" title={entry.username}>
        {entry.username}
      </h3>
      <p className="podium-tier">{entry.tierTitle}{isCurrentUser ? <UiBadge className="ml-2" tone="info">我</UiBadge> : null}</p>
      {entry.customTitle ? <p className="podium-custom-title" title={entry.customTitle}>{entry.customTitle}</p> : null}
      <p className="podium-points"><strong className="data-number">{entry.points}</strong><span>积分</span></p>
      <p className="podium-accepted">通过 {entry.acCount} 题</p>
    </article>
  );
}

function CurrentBattleCard({
  currentRanking,
  rankings,
  tiers,
}: {
  currentRanking: StudentRankingEntry;
  rankings: StudentRankingEntry[];
  tiers: readonly RankTier[];
}) {
  const progress = getRankTierProgress(currentRanking.points, tiers);
  const previousRanking = currentRanking.rank > 1 ? rankings[currentRanking.rank - 2] : null;
  const firstRanking = rankings[0] ?? null;
  const pointsGap = previousRanking
    ? Math.max(0, previousRanking.points - currentRanking.points)
    : 0;
  const pointsToFirst = firstRanking
    ? Math.max(0, firstRanking.points - currentRanking.points)
    : 0;
  const progressScale = progress.progressPercent / 100;

  return (
    <section className="ladder-my-battle" aria-labelledby="my-battle-heading">
      <div className="ladder-my-battle-grid">
        <div className="flex items-center gap-4">
          <RankEmblem className="rank-emblem-battle" eager tierTitle={currentRanking.tierTitle} />
          <div className="min-w-0">
            <p className="arena-kicker">My Record</p>
            <PageHeading as="h2" className="mt-1" id="my-battle-heading" size="section">
              我的战绩 · 第 {currentRanking.rank} 名
            </PageHeading>
            <p className="mt-1 break-words text-sm text-ink-600">
              {currentRanking.tierTitle} · {currentRanking.points} 积分 · 通过 {currentRanking.acCount} 题
            </p>
            {currentRanking.customTitle ? <p className="mt-1 break-words text-xs text-clay">{currentRanking.customTitle}</p> : null}
            <div className="mt-2 grid gap-1 text-xs font-semibold text-steel">
              {currentRanking.rank === 1 ? (
                <p>你正在守擂，继续完成新题巩固第一名。</p>
              ) : (
                <>
                  <p>
                    {pointsGap === 0
                      ? "你与前一名积分相同，继续完成唯一 AC 可争取反超。"
                      : `距离前一名还差 ${pointsGap} 分。`}
                  </p>
                  <p>
                    {pointsToFirst === 0
                      ? "你与第一名积分相同，继续提升唯一 AC 可争取登顶。"
                      : `距离第一名还差 ${pointsToFirst} 分。`}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ladder-next-target">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-ink-600">下一个目标</p>
              <p className="mt-1 text-lg font-bold text-ink-950">
                {progress.isMaxTier
                  ? "已达到最高段位"
                  : `晋级 ${progress.nextTierTitle}`}
              </p>
            </div>
            <span className="data-number text-2xl font-black text-steel">{progress.progressPercent}%</span>
          </div>
          <div
            aria-label="当前段位进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress.progressPercent}
            className="ladder-progress-track"
            role="progressbar"
          >
            <div
              className="progress-fill h-full bg-steel"
              style={{ "--progress": progressScale } as ProgressStyle}
            />
          </div>
          <div className="ladder-battle-actions"><NavigationLink className="btn btn-primary" href="/student/problems">去挑战新题</NavigationLink><LocateRankingButton userId={currentRanking.userId} /></div>
          <div className="mt-2 flex justify-between gap-3 text-xs font-bold text-ink-600">
            <span>{progress.currentTierTitle}</span>
            <span>
              {progress.isMaxTier
                ? "继续刷新天梯积分"
                : `还差 ${progress.pointsToNextTier} 积分晋级`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileRankingCards({
  currentUserId,
  rankings,
  showAdminColumns,
}: {
  currentUserId?: number;
  rankings: StudentRankingEntry[];
  showAdminColumns: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 p-4 md:hidden">
      {rankings.map((entry) => {
        const isCurrentUser = entry.userId === currentUserId;
        return (
          <article
            className={`leaderboard-row min-w-0 border p-4 ${
              isCurrentUser
                ? "border-steel/35 bg-steel/10"
                : "border-ink-950/10 bg-white/65"
            }`}
            key={entry.userId}
            data-ranking-user-id={entry.userId}
            tabIndex={-1}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="data-number ladder-row-place">
                {entry.rank}
              </span>
              <RankEmblem className="rank-emblem-sm" tierTitle={entry.tierTitle} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-bold text-ink-950" title={entry.username}>{entry.username}</h3>
                  {isCurrentUser ? (
                    <UiBadge className="flex-none border border-steel/25 bg-steel/10 px-2 py-0.5 text-xs font-black text-steel">我</UiBadge>
                  ) : null}
                </div>
                {entry.customTitle ? <p className="mt-1 truncate text-xs text-clay" title={entry.customTitle}>{entry.customTitle}</p> : null}
                <p className="mt-1 text-xs font-bold text-ink-600">{entry.tierTitle}</p>
              </div>
              <div className="ladder-mobile-points flex-none text-right">
                <p className="data-number text-xl font-black text-ink-950">{entry.points}</p>
                <p className="text-xs font-bold text-ink-600">积分</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-950/10 pt-3 text-xs font-bold text-ink-600">
              <span>唯一 AC {entry.acCount} 题 · AC {entry.acceptedSubmissionCount} 次</span>
              {showAdminColumns ? (
                <span>{entry.customTitle ? "管理员自定义头衔" : "自动段位头衔"}</span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DesktopRankingTable({
  currentUserId,
  rankings,
  showAdminColumns,
}: {
  currentUserId?: number;
  rankings: StudentRankingEntry[];
  showAdminColumns: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-ink-950/10 bg-[#f7f3ea] text-left">
            <th className="table-head px-5 py-3">排名</th>
            <th className="table-head px-5 py-3">学生</th>
            <th className="table-head px-5 py-3">头衔与段位</th>
            <th className="table-head px-5 py-3">积分</th>
            <th className="table-head px-5 py-3">唯一 AC</th>
            <th className="table-head px-5 py-3">AC 次数</th>
            {showAdminColumns ? <th className="table-head px-5 py-3">头衔来源</th> : null}
          </tr>
        </thead>
        <tbody>
          {rankings.map((entry) => {
            const isCurrentUser = entry.userId === currentUserId;
            return (
              <tr
                className={`leaderboard-row border-b border-ink-950/10 ${
                  isCurrentUser ? "bg-steel/10" : "bg-white/35"
                }`}
                key={entry.userId}
                data-ranking-user-id={entry.userId}
                tabIndex={-1}
              >
                <td className="px-5 py-4">
                  <span className="data-number ladder-row-place">
                    {entry.rank}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="max-w-52 truncate font-bold" title={entry.username}>{entry.username}</span>
                    {isCurrentUser ? (
                      <UiBadge className="border border-steel/25 bg-steel/10 px-2 py-0.5 text-xs font-black text-steel">我</UiBadge>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <RankEmblem className="rank-emblem-sm" tierTitle={entry.tierTitle} />
                    <div className="min-w-0">
                      {entry.customTitle ? <p className="max-w-56 truncate text-sm font-semibold text-clay" title={entry.customTitle}>{entry.customTitle}</p> : null}
                      <p className="text-xs font-bold text-ink-600">{entry.tierTitle}</p>
                    </div>
                  </div>
                </td>
                <td className="data-number px-5 py-4 text-lg font-black text-ink-950">{entry.points}</td>
                <td className="data-number px-5 py-4 text-sm font-bold text-ink-700">{entry.acCount}</td>
                <td className="data-number px-5 py-4 text-sm font-bold text-ink-700">{entry.acceptedSubmissionCount}</td>
                {showAdminColumns ? (
                  <td className="px-5 py-4">
                    <UiBadge className="border border-ink-950/10 bg-white/70 px-2 py-1 text-xs font-bold text-ink-700">
                      {entry.customTitle ? "管理员自定义" : "自动段位"}
                    </UiBadge>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="px-5 py-16 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center border border-clay/25 bg-clay/10 text-clay">
        <Award aria-hidden="true" size={30} />
      </span>
      <h2 className="mt-5 text-2xl font-black text-ink-950">天梯正在等待第一位挑战者</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-ink-600">
        创建学生账号后会自动出现在榜单；首次通过一道新题可获得 10 积分，重复通过同一道题不会重复加分。
      </p>
      <div className="mx-auto mt-5 flex w-fit items-center gap-2 border border-steel/20 bg-steel/10 px-4 py-3 text-sm font-black text-steel">
        <Target aria-hidden="true" size={17} />
        完成第一道唯一 AC，点亮段位徽章
      </div>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="ladder-summary-stat">
      <span aria-hidden="true">{icon}</span><span>{label}</span><strong className="data-number">{value}</strong>
    </div>
  );
}
