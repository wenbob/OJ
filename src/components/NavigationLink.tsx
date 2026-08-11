"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

type NavigationLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
  pendingLabel?: string;
};

export function NavigationLink({
  children,
  pendingLabel = "页面加载中",
  ...props
}: NavigationLinkProps) {
  return (
    <Link {...props}>
      <NavigationLinkContent pendingLabel={pendingLabel}>
        {children}
      </NavigationLinkContent>
    </Link>
  );
}

function NavigationLinkContent({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-busy={pending || undefined}
      className="navigation-link-content"
      data-navigation-pending={pending ? "true" : "false"}
    >
      {children}
      {pending ? (
        <span
          aria-live="polite"
          className="navigation-pending-indicator"
          role="status"
        >
          <span aria-hidden="true" className="navigation-pending-dot" />
          <span className="sr-only">{pendingLabel}</span>
        </span>
      ) : null}
    </span>
  );
}
