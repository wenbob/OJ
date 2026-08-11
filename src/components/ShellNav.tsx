"use client";

import { usePathname } from "next/navigation";
import { NavigationLink } from "@/components/NavigationLink";
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
          <NavigationLink
            aria-current={active ? "page" : undefined}
            className="shell-nav-link"
            data-active={active}
            href={item.href}
            key={item.href}
            pendingLabel={`正在打开${item.label}`}
          >
            {item.label}
          </NavigationLink>
        );
      })}
    </nav>
  );
}
