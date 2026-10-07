import Link from "next/link";
import { ChevronRight, CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { formatRuntime } from "@/lib/format";

const failureReasons: Record<string, string> = {
  "Wrong Answer": "答案不正确",
  "Compile Error": "编译错误",
  "Runtime Error": "程序运行出错",
  "Time Limit Exceeded": "运行超时",
};

export function ProgrammingSubmissionResult({
  detailHref,
  passedCount,
  runtimeMs,
  status,
  totalCount,
}: {
  detailHref: string;
  passedCount: number;
  runtimeMs: number;
  status: string;
  totalCount: number;
}) {
  const accepted = status === "Accepted";
  const reason = Object.hasOwn(failureReasons, status) ? failureReasons[status] : undefined;
  const confirmed = accepted || Boolean(reason);
  const title = accepted ? "通过了" : reason ? "未通过" : "结果待确认";
  const Icon = accepted ? CircleCheck : reason ? CircleX : CircleHelp;
  const tone = accepted
    ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
    : reason
      ? "border-rose-200 bg-rose-50/80 text-rose-800"
      : "border-ink-950/15 bg-stone-50 text-ink-700";

  return (
    <div
      aria-atomic="true"
      className={`mt-4 flex items-start justify-between gap-3 rounded-lg border p-3 ${tone}`}
      data-testid="programming-submission-summary"
      role="status"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={22} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="text-base font-bold">{title}</strong>
            {reason ? <span className="text-xs font-medium">{reason}</span> : null}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            {!confirmed
              ? "请查看提交记录"
              : status === "Compile Error"
                ? "检查代码后再提交"
                : `${passedCount}/${totalCount} 测试点 · ${formatRuntime(runtimeMs)}`}
          </p>
        </div>
      </div>
      <Link
        className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-md px-1 text-xs font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-steel"
        href={detailHref}
      >
        查看详情
        <ChevronRight aria-hidden="true" size={14} />
      </Link>
    </div>
  );
}
