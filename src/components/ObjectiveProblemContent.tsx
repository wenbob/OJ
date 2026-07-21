import katex from "katex";
import type { ReactNode } from "react";
import type { PublicObjectiveItem } from "@/lib/objectiveProblem";

type ObjectiveProblemContentItem = PublicObjectiveItem & {
  answer?: string;
};

export function ObjectiveProblemContent({
  items,
  showAnswers = false,
}: {
  items: ObjectiveProblemContentItem[];
  showAnswers?: boolean;
}) {
  const totalScore = items.reduce((sum, item) => sum + item.score, 0);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-950/10 pb-4">
        <div>
          <h2 className="text-xl font-black">选择判断题</h2>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            按题号顺序作答，答案输入区每行填写一个选项字母。
          </p>
        </div>
        <span className="text-sm font-black text-clay">
          共 {items.length} 题 · {totalScore} 分
        </span>
      </div>

      <div className="divide-y divide-ink-950/10">
        {items.map((item, index) => (
          <article className="py-6" key={`${index}-${item.stem}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.12em] text-steel">
                第 {index + 1} 题 · {item.kind === "judge" ? "判断题" : "单选题"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {showAnswers && item.answer ? (
                  <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                    答案 {item.answer}
                  </span>
                ) : null}
                <span className="border border-clay/20 bg-clay/10 px-2.5 py-1 text-xs font-black text-clay">
                  {item.score} 分
                </span>
              </div>
            </div>
            <ObjectiveRichText
              className="mt-4 text-base font-bold leading-7 text-ink-950"
              codeClassName="text-sm"
              value={item.stem}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {item.options.map((option) => (
                <div
                  className="grid grid-cols-[2rem_minmax(0,1fr)] items-start border border-ink-950/10 bg-white/58 px-3 py-3"
                  key={option.label}
                >
                  <span className="font-black text-steel">{option.label}</span>
                  <ObjectiveRichText
                    className="text-sm font-semibold leading-6 text-ink-800"
                    codeClassName="text-xs"
                    value={option.text}
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export type ObjectiveRichTextPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string };

export function splitObjectiveFencedCode(value: string): ObjectiveRichTextPart[] {
  const parts: ObjectiveRichTextPart[] = [];
  const pattern = /```[^\n]*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", value: match[1].replace(/\n$/, "") });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value }];
}

const inlineRichTextPattern =
  /`[^`\n]+`|!\[[^\]]*\]\(https?:\/\/[^)\s]+\)|\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\n])+\$/g;

function isTrustedObjectiveImage(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "cdn.luogu.com.cn" ||
      hostname.endsWith(".cdn.luogu.com.cn") ||
      hostname === "cdn.luogu.org" ||
      hostname.endsWith(".cdn.luogu.org")
    );
  } catch {
    return false;
  }
}

function renderMath(value: string, key: number) {
  const displayMode = value.startsWith("$$") && value.endsWith("$$");
  const source = value.slice(displayMode ? 2 : 1, displayMode ? -2 : -1);
  const html = katex.renderToString(source, {
    displayMode,
    output: "htmlAndMathml",
    strict: "warn",
    throwOnError: false,
  });

  return (
    <span
      className={
        displayMode
          ? "my-2 block max-w-full overflow-x-auto py-1"
          : "inline-block max-w-full align-middle"
      }
      dangerouslySetInnerHTML={{ __html: html }}
      key={key}
    />
  );
}

function renderInlineRichText(value: string) {
  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  inlineRichTextPattern.lastIndex = 0;

  while ((match = inlineRichTextPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={result.length}>{value.slice(lastIndex, match.index)}</span>);
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      result.push(
        <code
          className="border border-ink-950/10 bg-stone-100 px-1 py-0.5 font-mono text-[0.92em] font-bold text-ink-900"
          key={result.length}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("![")) {
      const image = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      if (image && isTrustedObjectiveImage(image[2])) {
        result.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={image[1] || "题目插图"}
            className="my-3 h-auto max-h-[32rem] max-w-full border border-ink-950/10 bg-white object-contain p-2"
            key={result.length}
            loading="lazy"
            src={image[2]}
          />,
        );
      } else {
        result.push(<span key={result.length}>{token}</span>);
      }
    } else {
      result.push(renderMath(token, result.length));
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < value.length) {
    result.push(<span key={result.length}>{value.slice(lastIndex)}</span>);
  }

  return result.length > 0 ? result : value;
}

function ObjectiveRichText({
  className,
  codeClassName,
  value,
}: {
  className: string;
  codeClassName: string;
  value: string;
}) {
  const parts = splitObjectiveFencedCode(value);

  return (
    <div className={`grid gap-3 ${className}`}>
      {parts.map((part, index) =>
        part.type === "code" ? (
          <pre
            className={`overflow-x-auto border border-ink-950/10 bg-stone-50 p-3 font-mono font-semibold leading-6 text-ink-900 ${codeClassName}`}
            key={index}
          >
            <code>{part.value}</code>
          </pre>
        ) : part.value.trim() ? (
          <p className="whitespace-pre-wrap" key={index}>
            {renderInlineRichText(part.value)}
          </p>
        ) : null,
      )}
    </div>
  );
}
