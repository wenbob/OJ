"use client";

import { useMemo } from "react";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { buildOutputDiff, type OutputHighlight } from "@/lib/outputDiff";

export function OutputComparison({ actual, caseIndex, expected }: {
  actual: string;
  caseIndex: number;
  expected: string;
}) {
  const diff = useMemo(() => buildOutputDiff(expected, actual), [expected, actual]);

  return (
    <section
      aria-label={`样例 ${caseIndex} 输出对比`}
      className="min-w-0"
      data-testid="sample-output-comparison"
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <OutputColumn raw={expected} side="expected" />
        <OutputColumn highlights={diff.actualHighlights} raw={actual} side="actual" />
      </div>
      {diff.truncated || diff.approximate ? (
        <p className="mt-2 text-xs text-ink-600">
          {diff.truncated
            ? diff.firstDifference
              ? "输出已截断，仅标记已显示的内容。"
              : "输出已截断，差异可能在未显示的部分。"
            : "输出较长，红色区域需要检查。"}
        </p>
      ) : null}
    </section>
  );
}

function OutputColumn({ highlights, raw, side }: {
  highlights?: OutputHighlight[];
  raw: string;
  side: "actual" | "expected";
}) {
  const title = side === "expected" ? "标准输出" : "程序输出";
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-ink-600">{title}</p>
        {raw.length > 0 ? (
          <CopyCodeButton
            ariaLabel={`复制${title}`}
            className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-steel hover:bg-steel/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-steel"
            code={raw}
            idleLabel="复制"
          />
        ) : null}
      </div>
      <pre
        aria-label={title}
        className="max-h-56 min-h-16 min-w-0 overflow-auto whitespace-pre-wrap rounded-md border border-ink-950/10 bg-white p-3 font-mono text-xs leading-6 text-ink-800 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-steel"
        data-testid={`sample-${side}-output`}
        tabIndex={0}
      >
        {highlights?.length
          ? <HighlightedOutput highlights={highlights} raw={raw} />
          : raw || "（无内容）"}
      </pre>
    </div>
  );
}

function HighlightedOutput({ highlights, raw }: {
  highlights: OutputHighlight[];
  raw: string;
}) {
  return <>
    {highlights.map((highlight, index) => {
      const previousEnd = index ? highlights[index - 1].end : 0;
      const missing = highlight.start === highlight.end;
      const text = raw.slice(highlight.start, highlight.end);
      const lineBreak = !missing && /^[\r\n]+$/.test(text);
      const label = missing ? "此处缺少内容" : lineBreak ? "此处换行有误" : "此处输出有误";
      return <span key={index}>
        {raw.slice(previousEnd, highlight.start)}
        <mark
          aria-label={missing ? label : undefined}
          className={`rounded-sm bg-rose-100 text-rose-800 underline decoration-rose-600 decoration-2 underline-offset-4 ${missing ? "px-1 font-sans text-[11px]" : ""}`}
          data-output-change={missing ? "gap" : "text"}
          title={label}
        >
          {missing ? "缺少内容" : <>
            {lineBreak ? <span aria-label={label} className="inline-block h-3 w-1.5 border-b-2 border-rose-600 bg-rose-100" /> : null}
            {text}
          </>}
        </mark>
      </span>;
    })}
    {raw.slice(highlights.at(-1)?.end ?? 0)}
  </>;
}
