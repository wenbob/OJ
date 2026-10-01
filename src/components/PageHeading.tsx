import type { HTMLAttributes } from "react";
import { UiIcon, type UiIconKind } from "@/components/UiIcon";

type PageHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3";
  kind?: UiIconKind;
  size?: "page" | "hero" | "section" | "content";
};

export function PageHeading({
  as: Heading = "h1",
  children,
  className = "",
  kind,
  size = "page",
  ...props
}: PageHeadingProps) {
  return (
    <Heading {...props} className={`arena-heading arena-heading-${size} ${className}`} data-ui-heading>
      {kind ? <UiIcon className="arena-heading-icon" kind={kind} size={size === "hero" ? 28 : size === "content" ? 18 : 23} /> : null}
      <span>{children}</span>
    </Heading>
  );
}
