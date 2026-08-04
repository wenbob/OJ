import Link from "next/link";

export type ObjectiveCaseFeedback = {
  caseIndex: number;
  status: string;
  actualOutput: string | null;
};

export function isObjectiveCaseCorrect(status: string) {
  return status === "Accepted";
}

export function formatObjectiveSubmittedAnswer(answer: string | null) {
  const normalized = answer?.trim();
  return normalized ? normalized : "未作答";
}

export function ObjectiveCaseFeedbackBadge({
  status,
}: {
  status: string;
}) {
  const correct = isObjectiveCaseCorrect(status);

  return (
    <span
      className={`inline-flex min-w-16 items-center justify-center border px-2.5 py-1 text-xs font-black ${
        correct
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {correct ? "正确" : "错误"}
    </span>
  );
}

export function ObjectiveSubmissionBreakdown({
  caseResults,
  defaultExpanded = true,
  detailHref,
}: {
  caseResults: ObjectiveCaseFeedback[];
  defaultExpanded?: boolean;
  detailHref?: string;
}) {
  const passedCount = caseResults.filter((item) =>
    isObjectiveCaseCorrect(item.status),
  ).length;
  const failedCount = caseResults.length - passedCount;

  return (
    <details
      className="mt-4 border border-ink-950/10 bg-white/70"
      open={defaultExpanded}
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="font-black text-ink-950">逐题结果</span>
        <span className="text-sm font-black text-ink-700">
          答对 {passedCount} 题 · 答错 {failedCount} 题 · 共 {caseResults.length} 题
        </span>
      </summary>

      <div className="border-t border-ink-950/10 p-3">
        {caseResults.length > 0 ? (
          <div className="grid gap-2" role="list">
            {caseResults.map((caseResult) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border border-ink-950/10 bg-linen/55 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(6rem,auto)]"
                key={caseResult.caseIndex}
                role="listitem"
              >
                <span className="text-sm font-black text-ink-900">
                  第 {caseResult.caseIndex} 题
                </span>
                <ObjectiveCaseFeedbackBadge status={caseResult.status} />
                <span className="col-span-2 text-xs font-bold text-ink-700 sm:col-span-1 sm:text-right">
                  我的答案：
                  <span className="ml-1 text-sm text-ink-950">
                    {formatObjectiveSubmittedAnswer(caseResult.actualOutput)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            本次提交没有逐题结果，通常是旧数据。
          </p>
        )}

        {detailHref ? (
          <Link className="btn btn-secondary mt-3 w-full" href={detailHref}>
            查看完整提交详情
          </Link>
        ) : null}
      </div>
    </details>
  );
}
