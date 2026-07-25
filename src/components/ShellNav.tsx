"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isShellNavItemActive } from "@/lib/shellNavigation";

type NavItem = {
  href: string;
  label: string;
};

export function ShellNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 md:px-6">
      {items.map((item) => {
        const active = isShellNavItemActive(pathname, item.href);
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
