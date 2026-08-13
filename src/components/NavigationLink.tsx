"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

type NavigationLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
  contentClassName?: string;
  pendingLabel?: string;
};

export function NavigationLink({
  children,
  contentClassName,
  pendingLabel = "页面加载中",
  ...props
}: NavigationLinkProps) {
  return (
    <Link {...props}>
      <NavigationLinkContent
        className={contentClassName}
        pendingLabel={pendingLabel}
      >
        {children}
      </NavigationLinkContent>
    </Link>
  );
}

function NavigationLinkContent({
  children,
  className,
  pendingLabel,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-busy={pending || undefined}
      className={`navigation-link-content ${className ?? ""}`}
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
