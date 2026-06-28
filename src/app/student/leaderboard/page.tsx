import { Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { requirePageUser } from "@/lib/auth";
import { findRankingByUserId, getStudentRankings } from "@/lib/ranking";

const studentNav = [
  { href: "/student", label: "首页" },
  { href: "/student/problems", label: "日常刷题" },
  { href: "/student/exams", label: "模拟考试" },
  { href: "/student/submissions", label: "日常提交" },
  { href: "/student/exam-submissions", label: "考试提交" },
];

export default async function StudentLeaderboardPage() {
  const user = await requirePageUser("student");
  const rankings = await getStudentRankings();
  const currentRanking = findRankingByUserId(rankings, user.id);

  return (
    <AppShell nav={studentNav} title="学生端" user={user}>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
                Ladder
              </p>
              <h1 className="mt-2 text-2xl font-black">天梯排行榜</h1>
              <p className="mt-2 text-sm font-semibold text-ink-600">
                按唯一 Accepted 题数计算积分，日常刷题和模拟考试都会计入。
              </p>
              <p className="mt-1 text-xs font-semibold text-ink-600">
                每题首次 Accepted 计 10 分；重复通过同一题不重复加分。
              </p>
            </div>
            {currentRanking ? (
              <div className="border border-steel/30 bg-steel/10 px-4 py-3 text-sm font-black text-steel">
                <Trophy className="mr-2 inline" size={16} />
                #{currentRanking.rank} · {currentRanking.displayTitle} · {currentRanking.points} 分
              </div>
            ) : null}
          </div>
        </div>
        <LeaderboardTable currentUserId={user.id} rankings={rankings} />
      </section>
    </AppShell>
  );
}
