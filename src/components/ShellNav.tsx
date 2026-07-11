"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/student" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ShellNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 md:px-6">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="shell-nav-link"
            data-active={active}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
