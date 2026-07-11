import Link from "next/link";
import { Code2 } from "lucide-react";
import { CurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { RankEmblem } from "@/components/RankEmblem";
import { ShellNav } from "@/components/ShellNav";
import { getStudentRankingSummaryForUser } from "@/lib/ranking";
import { getPublicSettings } from "@/lib/settings";

type NavItem = {
  href: string;
  label: string;
};

export async function AppShell({
  user,
  title,
  nav,
  children,
}: {
  user: CurrentUser;
  title: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const { siteName } = await getPublicSettings();
  const currentRanking = user.role === "student"
    ? await getStudentRankingSummaryForUser(user.id)
    : null;
  const leaderboardItem =
    user.role === "admin"
      ? { href: "/admin/leaderboard", label: "天梯榜" }
      : { href: "/student/leaderboard", label: "天梯榜" };
  const shellNav = nav.some((item) => item.href === leaderboardItem.href)
    ? nav
    : [...nav, leaderboardItem];

  return (
    <div className="min-h-screen">
      <header className="arena-shell-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Link className="group flex items-center gap-3" href={user.role === "admin" ? "/admin" : "/student"}>
            <span className="arena-brand-mark">
              <Code2 size={20} />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.2em] text-clay">
                {siteName}
              </span>
              <span className="block text-xl font-black tracking-tight text-ink-950">{title}</span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {currentRanking ? (
              <span className="identity-chip flex items-center gap-3 px-3 py-2">
                <RankEmblem className="rank-emblem-sm" tierTitle={currentRanking.tierTitle} />
                <span className="min-w-0">
                  <span className="block max-w-56 truncate text-sm font-black text-ink-950">
                    {user.username} · {currentRanking.displayTitle}
                  </span>
                  <span className="data-number block text-xs font-bold text-steel">
                    {currentRanking.tierTitle} · {currentRanking.points} 分
                  </span>
                </span>
              </span>
            ) : (
              <span className="identity-chip px-3 py-2 text-sm font-bold text-ink-800">
                {user.username} · {user.role === "admin" ? "管理员" : "学生"}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
        <ShellNav items={shellNav} />
      </header>
      <main className="app-stage mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-9">{children}</main>
    </div>
  );
}
