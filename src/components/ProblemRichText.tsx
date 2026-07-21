import katex from "katex";
import type { ReactNode } from "react";

export type ProblemRichTextPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string };

export function splitProblemFencedCode(value: string): ProblemRichTextPart[] {
  const parts: ProblemRichTextPart[] = [];
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

const inlineRichTextPatternSource =
  "`[^`\\n]+`|!\\[[^\\]]*\\]\\(https?:\\/\\/[^)\\s]+\\)|\\$\\$[\\s\\S]+?\\$\\$|\\$(?:\\\\.|[^$\\n])+\\$|\\*\\*[^*\\n]+\\*\\*|\\[[^\\]]+\\]\\(https?:\\/\\/[^)\\s]+\\)|<https?:\\/\\/[^>\\s]+>";

function isTrustedProblemImage(value: string) {
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

function renderInlineRichText(value: string): ReactNode {
  const result: ReactNode[] = [];
  const inlineRichTextPattern = new RegExp(inlineRichTextPatternSource, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

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
      if (image && isTrustedProblemImage(image[2])) {
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
    } else if (token.startsWith("**") && token.endsWith("**")) {
      result.push(
        <strong key={result.length}>
          {renderInlineRichText(token.slice(2, -2))}
        </strong>,
      );
    } else if (token.startsWith("[") || token.startsWith("<http")) {
      const markdownLink = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      const href = markdownLink?.[2] ?? token.slice(1, -1);
      const label = markdownLink?.[1] ?? href;
      result.push(
        <a
          className="font-bold text-steel underline decoration-steel/40 underline-offset-2"
          href={href}
          key={result.length}
          rel="noreferrer"
          target="_blank"
        >
          {label}
        </a>,
      );
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

function splitMarkdownTableRow(value: string) {
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let inMath = false;
  const row = value.trim().replace(/^\|/, "").replace(/\|$/, "");

  for (const char of row) {
    if (char === "\\" && !escaped) {
      escaped = true;
      current += char;
      continue;
    }
    if (char === "$" && !escaped) {
      inMath = !inMath;
      current += char;
      continue;
    }
    if (char === "|" && !escaped && !inMath) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    escaped = false;
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownTableSeparator(value: string) {
  const cells = splitMarkdownTableRow(value);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function renderTextBlocks(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.join("\n").trim();
    paragraph = [];
    if (!content) return;
    nodes.push(
      <p className="whitespace-pre-wrap" key={`paragraph-${nodes.length}`}>
        {renderInlineRichText(content)}
      </p>,
    );
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (/^::cute-table\{[^}]+\}\s*$/.test(trimmed)) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      nodes.push(
        <h3 className="pt-1 text-base font-black text-ink-950" key={`heading-${nodes.length}`}>
          {renderInlineRichText(heading[2])}
        </h3>,
      );
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
        tableLines.push(lines[cursor]);
        cursor += 1;
      }
      if (tableLines.length >= 2 && isMarkdownTableSeparator(tableLines[1])) {
        flushParagraph();
        const header = splitMarkdownTableRow(tableLines[0]);
        const rows = tableLines.slice(2).map((row) => {
          const cells = splitMarkdownTableRow(row);
          return [...cells, ...Array(Math.max(0, header.length - cells.length)).fill("")]
            .slice(0, header.length);
        });
        nodes.push(
          <div className="max-w-full overflow-x-auto" key={`table-${nodes.length}`}>
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr>
                  {header.map((cell, cellIndex) => (
                    <th className="border border-ink-950/15 bg-stone-100 px-3 py-2 font-black" key={cellIndex}>
                      {renderInlineRichText(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td className="border border-ink-950/15 bg-white/60 px-3 py-2 align-top" key={cellIndex}>
                        {renderInlineRichText(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        index = cursor - 1;
        continue;
      }
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      let cursor = index;
      const itemPattern = ordered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (cursor < lines.length) {
        const item = itemPattern.exec(lines[cursor].trim());
        if (!item) break;
        items.push(item[1]);
        cursor += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      nodes.push(
        <ListTag
          className={ordered ? "list-decimal space-y-1 pl-6" : "list-disc space-y-1 pl-6"}
          key={`list-${nodes.length}`}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineRichText(item)}</li>
          ))}
        </ListTag>,
      );
      index = cursor - 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      nodes.push(<hr className="border-ink-950/10" key={`rule-${nodes.length}`} />);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return nodes;
}

export function ProblemRichText({
  className,
  codeClassName,
  value,
}: {
  className: string;
  codeClassName: string;
  value: string;
}) {
  const parts = splitProblemFencedCode(value);

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
          <div className="grid gap-3" key={index}>
            {renderTextBlocks(part.value)}
          </div>
        ) : null,
      )}
    </div>
  );
}
