import type { ComponentProps } from "react";
import { NavigationLink } from "@/components/NavigationLink";

export function FilterLink({
  active,
  className = "",
  pendingLabel = "正在筛选题目",
  ...props
}: ComponentProps<typeof NavigationLink> & { active: boolean }) {
  return (
    <NavigationLink
      {...props}
      aria-current={active ? "page" : undefined}
      className={`arena-filter-link ${className}`}
      data-active={active}
      pendingLabel={pendingLabel}
    />
  );
}

export function FilterButton({
  active,
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { active: boolean }) {
  return <button {...props} aria-pressed={active} className={`arena-filter-link ${className}`} data-active={active} type={type} />;
}
