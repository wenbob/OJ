import Link from "next/link";
import type { ProblemType } from "@/lib/objectiveProblem";

export function AcceptedProblemIndicator({
  problemTitle,
  problemType,
  submissionId,
}: {
  problemTitle: string;
  problemType: ProblemType;
  submissionId: number;
}) {
  const actionLabel =
    problemType === "objective" ? "查看通过答案" : "查看通过代码";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800">
        已通过
      </span>
      <Link
        aria-label={`${actionLabel}：${problemTitle}`}
        className="border border-emerald-300 bg-white/80 px-2 py-0.5 text-xs font-black text-emerald-800 hover:border-emerald-500 hover:bg-emerald-50"
        href={`/admin/submissions/${submissionId}`}
      >
        {actionLabel}
      </Link>
    </span>
  );
}
