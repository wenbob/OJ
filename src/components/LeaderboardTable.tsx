import type { StudentRankingEntry } from "@/lib/ranking";

function rankBadgeClass(rank: number) {
  if (rank === 1) return "border-steel bg-steel text-linen";
  if (rank === 2) return "border-clay bg-clay text-linen";
  if (rank === 3) return "border-moss bg-moss text-linen";
  return "border-ink-950 bg-ink-950 text-linen";
}

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

  return (
    <div>
      <div className="grid gap-3 border-b border-ink-950/10 bg-white/45 p-4 sm:grid-cols-3">
        <SummaryStat label="上榜学生" value={rankings.length} />
        <SummaryStat label="累计积分" value={totalPoints} />
        <SummaryStat label="累计唯一 AC" value={totalUniqueAccepted} />
      </div>

      {currentRanking ? (
        <div className="border-b border-steel/20 bg-steel/10 px-5 py-3 text-sm font-semibold text-steel">
          你当前排名第 {currentRanking.rank}，{currentRanking.points} 积分，唯一 AC {currentRanking.acCount} 题。
        </div>
      ) : null}

      <p className="border-b border-ink-950/10 px-5 py-3 text-xs font-semibold text-ink-600 md:hidden">
        表格可左右滑动查看积分、唯一 AC 和 AC 次数。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-ink-950/10 bg-white/55 text-left">
              <th className="table-head px-5 py-3">排名</th>
              <th className="table-head px-5 py-3">学生</th>
              <th className="table-head px-5 py-3">展示头衔</th>
              <th className="table-head px-5 py-3">自动段位</th>
              <th className="table-head px-5 py-3">积分</th>
              <th className="table-head px-5 py-3">唯一 AC</th>
              <th className="table-head px-5 py-3">AC 次数</th>
              {showAdminColumns ? (
                <th className="table-head px-5 py-3">头衔来源</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rankings.map((entry) => {
              const isCurrentUser = entry.userId === currentUserId;
              return (
                <tr
                  className={`border-b border-ink-950/10 ${
                    isCurrentUser ? "bg-steel/10 shadow-line" : "bg-white/15"
                  }`}
                  key={entry.userId}
                >
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex h-9 min-w-9 items-center justify-center border px-2 text-sm font-black ${rankBadgeClass(
                        entry.rank,
                      )}`}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="max-w-56 truncate font-black">
                        {entry.username}
                      </span>
                      {isCurrentUser ? (
                        <span className="border border-steel/25 bg-steel/10 px-2 py-0.5 text-xs font-black text-steel">
                          我
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex max-w-60 border border-clay/30 bg-clay/10 px-3 py-1 text-sm font-black text-clay">
                      <span className="truncate">{entry.displayTitle}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {entry.tierTitle}
                  </td>
                  <td className="px-5 py-4 text-lg font-black text-ink-950">
                    {entry.points}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {entry.acCount}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {entry.acceptedSubmissionCount}
                  </td>
                  {showAdminColumns ? (
                    <td className="px-5 py-4">
                      <span className="border border-ink-950/10 bg-white/60 px-2 py-1 text-xs font-bold text-ink-700">
                        {entry.customTitle ? "管理员自定义" : "自动段位"}
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {rankings.length === 0 ? (
              <tr>
                <td
                  className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                  colSpan={showAdminColumns ? 8 : 7}
                >
                  还没有学生进入天梯榜。新增学生或学生完成 Accepted 后，这里会自动出现排名。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-ink-950/10 bg-linen/70 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ink-600">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-ink-950">{value}</p>
    </div>
  );
}
