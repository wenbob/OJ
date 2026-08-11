import Link from "next/link";
import { Code2 } from "lucide-react";
import { CurrentUser, roleHome } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { RankEmblem } from "@/components/RankEmblem";
import { ShellNav } from "@/components/ShellNav";
import { SessionPresenceGuard } from "@/components/SessionPresenceGuard";
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
  locked = false,
  children,
}: {
  user: CurrentUser;
  title: string;
  nav: NavItem[];
  locked?: boolean;
  children: React.ReactNode;
}) {
  const [publicSettings, currentRanking] = await Promise.all([
    getPublicSettings(),
    user.role === "student" && !locked
      ? getStudentRankingSummaryForUser(user.id)
      : Promise.resolve(null),
  ]);
  const { siteName } = publicSettings;
  const supplementalItems = user.role !== "student"
    ? [
        {
          href: `${user.role === "admin" ? "/admin" : "/teacher"}/ai-usage`,
          label: "AI 使用",
        },
        {
          href: `${user.role === "admin" ? "/admin" : "/teacher"}/learning`,
          label: "学情看板",
        },
        {
          href: `${user.role === "admin" ? "/admin" : "/teacher"}/leaderboard`,
          label: "天梯榜",
        },
      ]
    : [
        { href: "/student/assignments", label: "专项练习" },
        { href: "/student/review", label: "错题本" },
        { href: "/student/leaderboard", label: "天梯榜" },
      ];
  const shellNav = supplementalItems.reduce(
    (items, item) =>
      items.some((navItem) => navItem.href === item.href) ? items : [...items, item],
    nav,
  );

  return (
    <div className="min-h-screen" data-app-shell-root>
      {user.role === "student" ? <SessionPresenceGuard /> : null}
      <header className="arena-shell-header" data-app-shell-header>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          {locked ? (
            <div
              className="flex items-center gap-3"
              aria-label={`${siteName} ${title}`}
            >
              <BrandIdentity siteName={siteName} title={title} />
            </div>
          ) : (
            <Link
              className="group flex items-center gap-3"
              href={roleHome(user.role)}
            >
              <BrandIdentity siteName={siteName} title={title} />
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {locked ? (
              <span className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900">
                考试进行中
              </span>
            ) : null}
            {currentRanking ? (
              <span className="identity-chip flex items-center gap-3 px-3 py-2">
                <RankEmblem
                  className="rank-emblem-sm"
                  tierTitle={currentRanking.tierTitle}
                />
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
                {user.username} ·{" "}
                {user.role === "admin"
                  ? "管理员"
                  : user.role === "teacher"
                    ? "老师"
                    : "学生"}
              </span>
            )}
            {!locked ? <LogoutButton /> : null}
          </div>
        </div>
        {!locked ? <ShellNav items={shellNav} /> : null}
      </header>
      <main className="app-stage mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-9">
        {children}
      </main>
    </div>
  );
}

function BrandIdentity({ siteName, title }: { siteName: string; title: string }) {
  return (
    <>
      <span className="arena-brand-mark">
        <Code2 size={20} />
      </span>
      <span>
        <span className="block text-xs font-black uppercase tracking-[0.2em] text-clay">
          {siteName}
        </span>
        <span className="block text-xl font-black tracking-tight text-ink-950">
          {title}
        </span>
      </span>
    </>
  );
}
