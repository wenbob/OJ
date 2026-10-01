"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowRight, BookOpen, BookOpenCheck, BrainCircuit, ChartNoAxesCombined,
  ClipboardList, FileText, Gift, History, House, Megaphone, MessageSquare,
  Settings, Timer, Trophy, Users, type LucideIcon,
} from "lucide-react";
import { NavigationLink } from "@/components/NavigationLink";
import { isShellNavItemActive } from "@/lib/shellNavigation";

type NavItem = {
  href: string;
  label: string;
};

const navIcons: Record<string, LucideIcon> = {
  problems: BookOpen,
  practice: BookOpen,
  exams: Timer,
  submissions: History,
  "exam-submissions": FileText,
  assignments: ClipboardList,
  review: BookOpenCheck,
  leaderboard: Trophy,
  rewards: Gift,
  feedback: MessageSquare,
  announcements: Megaphone,
  users: Users,
  "ai-usage": BrainCircuit,
  learning: ChartNoAxesCombined,
  settings: Settings,
};

export function ShellNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setHasMore(nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 8);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    nav.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, [items]);

  return (
    <div className="shell-nav-strip mx-auto max-w-7xl">
      <nav aria-label="主导航" className="shell-nav-items" ref={navRef}>
        {items.map((item) => {
          const active = isShellNavItemActive(pathname, item.href);
          const Icon = navIcons[item.href.split("/")[2]] ?? House;
          return (
            <NavigationLink
              aria-current={active ? "page" : undefined}
              className="shell-nav-link"
              data-active={active}
              href={item.href}
              key={item.href}
              pendingLabel={`正在打开${item.label}`}
            >
              <Icon aria-hidden="true" className="shell-nav-icon" size={16} strokeWidth={1.8} />
              {item.label}
            </NavigationLink>
          );
        })}
      </nav>
      {hasMore ? (
        <button
          aria-label="向右查看更多导航"
          className="shell-nav-more"
          onClick={() => navRef.current?.scrollBy({
            left: navRef.current.clientWidth * 0.7,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          })}
          type="button"
        >
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      ) : null}
    </div>
  );
}
