import Link from "next/link";
import type { ProblemType } from "@/lib/objectiveProblem";
import { CheckCircle2 } from "lucide-react";
import { UiBadge } from "@/components/UiBadge";

export function AcceptedProblemIndicator({
  detailHrefBase = "/admin/submissions",
  problemTitle,
  problemType,
  submissionId,
}: {
  detailHrefBase?: string;
  problemTitle: string;
  problemType: ProblemType;
  submissionId: number;
}) {
  const actionLabel =
    problemType === "objective" ? "查看通过答案" : "查看通过代码";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <UiBadge tone="success">
        <CheckCircle2 aria-hidden="true" size={12} />
        已通过
      </UiBadge>
      <Link
        aria-label={`${actionLabel}：${problemTitle}`}
        className="arena-badge arena-badge-action border-emerald-300 bg-white/80 text-emerald-800"
        href={`${detailHrefBase}/${submissionId}`}
      >
        {actionLabel}
      </Link>
    </span>
  );
}
