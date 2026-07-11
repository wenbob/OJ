import Link from "next/link";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { requirePageUser } from "@/lib/auth";
import { getStudentRankings } from "@/lib/ranking";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

export default async function AdminLeaderboardPage() {
  const user = await requirePageUser("admin");
  const rankings = await getStudentRankings();

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <section className="surface overflow-hidden">
        <div className="border-b border-ink-950/10 bg-ink-950 p-5 text-linen md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="arena-kicker text-[#d7a062]">
                Ladder Admin
              </p>
              <h1 className="mt-2 text-3xl font-black">天梯管理台</h1>
              <p className="mt-2 text-sm font-semibold text-[#e5ded0]">
                实时读取历史提交计算，不写积分缓存表。
              </p>
              <p className="mt-1 text-xs font-semibold text-[#c8c0b2]">
                排名按积分、唯一 AC、AC 次数、用户名和用户 ID 依次排序。
              </p>
            </div>
            <Link className="btn border-[#d6a44a]/35 bg-[#d6a44a]/10 text-[#f2d28c]" href="/admin/users">
              <Trophy size={16} />
              管理学生头衔
            </Link>
          </div>
        </div>
        <LeaderboardTable rankings={rankings} showAdminColumns />
      </section>
    </AppShell>
  );
}
