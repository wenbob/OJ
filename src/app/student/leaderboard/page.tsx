import { Sparkles, Trophy } from "lucide-react";
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
        <div className="relative overflow-hidden border-b border-ink-950/10 bg-ink-950 p-5 text-linen md:p-8">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border-[28px] border-white/5" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="arena-kicker text-[#d7a062]">
                Arena Ladder
              </p>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">天梯竞技场</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#e5ded0]">
                按唯一 Accepted 题数计算积分，日常刷题和模拟考试都会计入。
              </p>
              <p className="mt-1 text-xs font-semibold text-[#c8c0b2]">
                每题首次 Accepted 计 10 分；重复通过同一题不重复加分。
              </p>
            </div>
            {currentRanking ? (
              <div className="border border-[#d6a44a]/40 bg-[#d6a44a]/10 px-4 py-3 text-sm font-black text-[#f2d28c]">
                <Trophy className="mr-2 inline" size={17} />
                <span className="data-number">#{currentRanking.rank}</span> · {currentRanking.displayTitle} · {currentRanking.points} 分
              </div>
            ) : null}
          </div>
          <div className="relative mt-6 flex items-center gap-2 text-xs font-bold text-[#c8c0b2]">
            <Sparkles size={15} />
            每一道新的唯一 AC，都会推动你的段位与排名向前。
          </div>
        </div>
        <LeaderboardTable currentUserId={user.id} rankings={rankings} />
      </section>
    </AppShell>
  );
}
