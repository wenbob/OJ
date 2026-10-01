import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { AcceptedProblemIndicator } from "@/components/AcceptedProblemIndicator";
import { ProblemEntryLink } from "@/components/ProblemEntryLink";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import { UiBadge } from "@/components/UiBadge";
import { normalizeProblemType } from "@/lib/objectiveProblem";

type ProblemListItem = {
  id: number;
  title: string;
  difficulty: string;
  category: string;
  problemType: string;
};

export function ProblemListTable({
  problems,
  detailHrefBase,
  submissionCounts,
  acceptedProblemIds,
  latestAcceptedSubmissionIds,
  submissionHrefBase,
  emptyState,
}: {
  problems: ProblemListItem[];
  detailHrefBase: string;
  submissionCounts: ReadonlyMap<number, number>;
  acceptedProblemIds?: ReadonlySet<number>;
  latestAcceptedSubmissionIds?: ReadonlyMap<number, number>;
  submissionHrefBase?: string;
  emptyState: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-ink-950/10 bg-white/55 text-left">
            {["标题", "难度", "分类", "题型", submissionHrefBase ? "提交" : "我的提交", "操作"].map((title, index) => (
              <th className={`table-head px-5 py-3 ${index === 5 ? "text-right" : ""}`} key={title}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {problems.map((problem) => {
            const acceptedSubmissionId = latestAcceptedSubmissionIds?.get(problem.id);
            const isAccepted = Boolean(acceptedSubmissionId) || Boolean(acceptedProblemIds?.has(problem.id));
            return (
              <tr className={`problem-entry border-b border-ink-950/10 ${isAccepted ? "" : "problem-hover-incomplete"}`} data-accepted={isAccepted} key={problem.id}>
                <td className="max-w-sm break-words px-5 py-4 font-semibold">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="[overflow-wrap:anywhere]" id={`problem-title-${problem.id}`}>{problem.title}</span>
                    {acceptedSubmissionId && submissionHrefBase ? (
                      <AcceptedProblemIndicator detailHrefBase={submissionHrefBase} problemTitle={problem.title} problemType={normalizeProblemType(problem.problemType)} submissionId={acceptedSubmissionId} />
                    ) : isAccepted ? (
                      <UiBadge tone="success"><CheckCircle2 aria-hidden="true" size={12} />已通过</UiBadge>
                    ) : null}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">{problem.difficulty}</td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">{problem.category || "未分类"}</td>
                <td className="px-5 py-4"><ProblemTypeBadge type={problem.problemType} /></td>
                <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                  {submissionHrefBase ? (
                    <Link className="font-semibold text-steel underline-offset-4 hover:text-clay hover:underline" href={`${submissionHrefBase}?problemId=${problem.id}`} title={`查看《${problem.title}》的提交记录`}>{submissionCounts.get(problem.id) ?? 0}</Link>
                  ) : submissionCounts.get(problem.id) ?? 0}
                </td>
                <td className="px-5 py-4 text-right">
                  <ProblemEntryLink aria-describedby={`problem-title-${problem.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-steel hover:text-clay" href={`${detailHrefBase}/${problem.id}`}>
                    {isAccepted ? "再次练习" : submissionHrefBase ? "进入做题" : "开始做题"}<ChevronRight aria-hidden="true" size={16} />
                  </ProblemEntryLink>
                </td>
              </tr>
            );
          })}
          {problems.length === 0 ? <tr><td className="px-5 py-5 text-center" colSpan={6}>{emptyState}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
