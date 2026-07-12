import type { CSSProperties } from "react";
import { Award, BookOpenCheck, Crown, Medal, Target, Trophy, Users } from "lucide-react";
import { RankEmblem } from "@/components/RankEmblem";
import {
  getRankTierProgress,
  type StudentRankingEntry,
} from "@/lib/ranking";

type ProgressStyle = CSSProperties & { "--progress": number };
type PodiumStyle = CSSProperties & { "--podium-delay": string };

export function LeaderboardTable({
  currentUserId,
  rankings,
  showAdminColumns = false,
}: {
  currentUserId?: number;
  rankings: StudentRankingEntry[];
  showAdminColumns?: boolean;
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
    <div>
      <div className="scoreboard-strip grid gap-px border-b border-ink-950/10 sm:grid-cols-3">
        <SummaryStat icon={<Users size={18} />} label="上榜学生" value={rankings.length} />
        <SummaryStat icon={<Trophy size={18} />} label="累计积分" value={totalPoints} />
        <SummaryStat icon={<BookOpenCheck size={18} />} label="累计唯一 AC" value={totalUniqueAccepted} />
      </div>

      <Podium rankings={topThree} />

      {currentRanking ? (
        <CurrentBattleCard currentRanking={currentRanking} rankings={rankings} />
      ) : null}

      {remainingRankings.length > 0 ? (
        <section aria-labelledby="ranking-list-heading" className="border-t border-ink-950/10">
          <div className="flex flex-wrap items-end justify-between gap-3 bg-white/55 px-5 py-4">
            <div>
              <p className="arena-kicker">Rankings</p>
              <h2 className="mt-1 text-xl font-black text-ink-950" id="ranking-list-heading">
                第四名及以后
              </h2>
            </div>
            <p className="text-xs font-bold text-ink-600">积分相同时继续比较唯一 AC、AC 次数和用户名</p>
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

function Podium({ rankings }: { rankings: StudentRankingEntry[] }) {
  return (
    <section aria-label="天梯前三名" className="bg-[rgba(244,239,228,0.74)] px-4 pb-8 pt-12 md:px-8 md:pt-16">
      <div className="mx-auto grid max-w-5xl items-end gap-4 md:grid-cols-3">
        {rankings.map((entry) => {
          const orderClass =
            entry.rank === 1
              ? "order-1 md:order-2 md:-translate-y-5"
              : entry.rank === 2
                ? "order-2 md:order-1"
                : "order-3";
          return (
            <div className={orderClass} key={entry.userId}>
              <PodiumCard entry={entry} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PodiumCard({ entry }: { entry: StudentRankingEntry }) {
  const delay = entry.rank === 1 ? "80ms" : entry.rank === 2 ? "0ms" : "150ms";
  const PlaceIcon = entry.rank === 1 ? Crown : entry.rank === 2 ? Trophy : Medal;

  return (
    <article
      className="podium-card p-5 text-center"
      data-place={entry.rank}
      style={{ "--podium-delay": delay } as PodiumStyle}
    >
      <span aria-hidden="true" className="podium-shine" />
      <div className="flex items-center justify-between gap-3">
        <span className="data-number text-sm font-black text-ink-600">NO. {entry.rank}</span>
        <PlaceIcon aria-hidden="true" className="text-clay" size={20} />
      </div>
      <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center border border-ink-950/12 bg-ink-950 text-2xl font-black text-linen shadow-[6px_6px_0_rgba(182,107,65,0.2)]">
        {getUsernameInitial(entry.username)}
      </div>
      <h3 className="mt-4 truncate text-xl font-black text-ink-950" title={entry.username}>
        {entry.username}
      </h3>
      <p className="mt-1 truncate text-sm font-black text-clay" title={entry.displayTitle}>
        {entry.displayTitle}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2 border-y border-ink-950/10 py-3">
        <RankEmblem className="rank-emblem-sm" tierTitle={entry.tierTitle} />
        <span className="text-left">
          <span className="block text-xs font-bold text-ink-600">自动段位</span>
          <span className="block text-sm font-black text-ink-950">{entry.tierTitle}</span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-left">
        <PodiumMetric label="积分" value={entry.points} />
        <PodiumMetric label="唯一 AC" value={entry.acCount} />
      </div>
    </article>
  );
}

function CurrentBattleCard({
  currentRanking,
  rankings,
}: {
  currentRanking: StudentRankingEntry;
  rankings: StudentRankingEntry[];
}) {
  const progress = getRankTierProgress(currentRanking.points);
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
    <section className="border-t border-ink-950/10 bg-steel/10 px-4 py-6 md:px-8" aria-labelledby="my-battle-heading">
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.35fr]">
        <div className="flex items-center gap-4">
          <RankEmblem tierTitle={currentRanking.tierTitle} />
          <div className="min-w-0">
            <p className="arena-kicker">My Record</p>
            <h2 className="mt-1 truncate text-2xl font-black text-ink-950" id="my-battle-heading">
              我的战绩 · 第 {currentRanking.rank} 名
            </h2>
            <p className="mt-1 text-sm font-bold text-ink-600">
              {currentRanking.displayTitle} · {currentRanking.points} 积分 · 唯一 AC {currentRanking.acCount} 题
            </p>
            <div className="mt-2 grid gap-1 text-sm font-black text-steel">
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

        <div className="border border-steel/20 bg-white/72 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ink-600">Tier Progress</p>
              <p className="mt-1 text-lg font-black text-ink-950">
                {progress.isMaxTier
                  ? "已达到最高段位"
                  : `距离 ${progress.nextTierTitle} 还差 ${progress.pointsToNextTier} 分`}
              </p>
            </div>
            <span className="data-number text-2xl font-black text-steel">{progress.progressPercent}%</span>
          </div>
          <div
            aria-label="当前段位进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress.progressPercent}
            className="mt-3 h-3 overflow-hidden border border-ink-950/10 bg-linen p-[2px]"
            role="progressbar"
          >
            <div
              className="progress-fill h-full bg-steel"
              style={{ "--progress": progressScale } as ProgressStyle}
            />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs font-bold text-ink-600">
            <span>{progress.currentTierTitle}</span>
            <span>
              {progress.isMaxTier
                ? "继续刷新天梯积分"
                : `再完成 ${progress.acceptedProblemsToNextTier} 道唯一 AC`}
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
    <div className="grid gap-3 p-4 md:hidden">
      {rankings.map((entry) => {
        const isCurrentUser = entry.userId === currentUserId;
        return (
          <article
            className={`leaderboard-row border p-4 ${
              isCurrentUser
                ? "border-steel/35 bg-steel/10"
                : "border-ink-950/10 bg-white/65"
            }`}
            key={entry.userId}
          >
            <div className="flex items-start gap-3">
              <span className="data-number flex h-10 min-w-10 items-center justify-center bg-ink-950 px-2 text-sm font-black text-linen">
                {entry.rank}
              </span>
              <RankEmblem className="rank-emblem-sm" tierTitle={entry.tierTitle} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-black text-ink-950">{entry.username}</h3>
                  {isCurrentUser ? (
                    <span className="border border-steel/25 bg-steel/10 px-2 py-0.5 text-xs font-black text-steel">我</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm font-black text-clay">{entry.displayTitle}</p>
                <p className="mt-1 text-xs font-bold text-ink-600">{entry.tierTitle}</p>
              </div>
              <div className="text-right">
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
              >
                <td className="px-5 py-4">
                  <span className="data-number inline-flex h-9 min-w-9 items-center justify-center bg-ink-950 px-2 text-sm font-black text-linen">
                    {entry.rank}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="max-w-52 truncate font-black">{entry.username}</span>
                    {isCurrentUser ? (
                      <span className="border border-steel/25 bg-steel/10 px-2 py-0.5 text-xs font-black text-steel">我</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <RankEmblem className="rank-emblem-sm" tierTitle={entry.tierTitle} />
                    <div className="min-w-0">
                      <p className="max-w-56 truncate text-sm font-black text-clay">{entry.displayTitle}</p>
                      <p className="text-xs font-bold text-ink-600">{entry.tierTitle}</p>
                    </div>
                  </div>
                </td>
                <td className="data-number px-5 py-4 text-lg font-black text-ink-950">{entry.points}</td>
                <td className="data-number px-5 py-4 text-sm font-bold text-ink-700">{entry.acCount}</td>
                <td className="data-number px-5 py-4 text-sm font-bold text-ink-700">{entry.acceptedSubmissionCount}</td>
                {showAdminColumns ? (
                  <td className="px-5 py-4">
                    <span className="border border-ink-950/10 bg-white/70 px-2 py-1 text-xs font-bold text-ink-700">
                      {entry.customTitle ? "管理员自定义" : "自动段位"}
                    </span>
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
    <div className="flex items-center gap-3 border-white/10 px-5 py-4 sm:border-r last:border-r-0">
      <span className="text-[#d6a44a]">{icon}</span>
      <span>
        <span className="block text-xs font-black uppercase tracking-[0.14em] text-[#d9d2c3]">{label}</span>
        <span className="data-number mt-0.5 block text-2xl font-black">{value}</span>
      </span>
    </div>
  );
}

function PodiumMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-linen/80 px-3 py-2">
      <p className="text-xs font-bold text-ink-600">{label}</p>
      <p className="data-number mt-0.5 text-xl font-black text-ink-950">{value}</p>
    </div>
  );
}

function getUsernameInitial(username: string) {
  return Array.from(username.trim())[0] ?? "学";
}
