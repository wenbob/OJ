import type { ProblemType } from "@/lib/objectiveProblem";
import { UiBadge } from "@/components/UiBadge";

export function ProblemTypeBadge({ type }: { type: ProblemType | string }) {
  const objective = type === "objective";

  return (
    <UiBadge tone={objective ? "accent" : "info"}>
      {objective ? "选择判断" : "编程题"}
    </UiBadge>
  );
}
