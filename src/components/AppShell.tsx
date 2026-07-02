import Link from "next/link";
import { Code2 } from "lucide-react";
import { CurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
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
      <header className="border-b border-ink-950/10 bg-linen/86 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <Link className="flex items-center gap-3" href={user.role === "admin" ? "/admin" : "/student"}>
            <span className="flex h-10 w-10 items-center justify-center border border-ink-950/15 bg-ink-950 text-linen">
              <Code2 size={20} />
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.18em] text-ink-600">
                {siteName}
              </span>
              <span className="block text-lg font-black text-ink-950">{title}</span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-ink-950/10 bg-white/55 px-3 py-2 text-sm font-semibold text-ink-800">
              {currentRanking
                ? `${user.username} · ${currentRanking.displayTitle} · ${currentRanking.points} 分`
                : `${user.username} · ${user.role}`}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 md:px-6">
          {shellNav.map((item) => (
            <Link
              className="border border-ink-950/10 bg-white/58 px-3 py-2 text-sm font-bold text-ink-800 hover:border-steel hover:text-steel"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
