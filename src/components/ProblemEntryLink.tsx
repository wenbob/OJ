import type { ComponentProps } from "react";
import { NavigationLink } from "@/components/NavigationLink";

// The containing row/card owns the stretched link; secondary controls stay above it.
export function ProblemEntryLink({
  className = "",
  pendingLabel = "正在打开题目",
  ...props
}: ComponentProps<typeof NavigationLink>) {
  return <NavigationLink {...props} className={`problem-entry-link ${className}`} data-problem-entry-link pendingLabel={pendingLabel} />;
}
