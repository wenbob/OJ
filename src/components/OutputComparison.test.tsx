import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { truncateCppOutput } from "@/lib/cppRun";
import { OutputComparison } from "./OutputComparison";

describe("OutputComparison", () => {
  it("keeps standard output untouched and highlights only the wrong program text", () => {
    const expected = "sum = 13 \nok\n";
    const html = renderToStaticMarkup(<OutputComparison actual={"sum = 12\nok"} caseIndex={1} expected={expected} />);
    expect(html).toContain('aria-label="样例 1 输出对比"');
    const standardOutput = html.match(/<pre[^>]*data-testid="sample-expected-output"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    expect(standardOutput).toBe(expected);
    expect(html).not.toContain("显示空白字符");
    expect(html).not.toContain("首处差异");
    expect(html).not.toContain("绿色");
    expect(html).not.toMatch(/[∅·⇥↵]/);
    expect(html).toContain('title="此处输出有误">2</mark>');
    expect(html.match(/<mark /g)).toHaveLength(1);
  });

  it("provides an explicit empty-output marker and keyboard-accessible panels", () => {
    const html = renderToStaticMarkup(<OutputComparison actual="" caseIndex={2} expected="3" />);
    expect(html).toContain('aria-label="此处缺少内容"');
    expect(html).toContain("缺少内容");
    expect(html).not.toContain("∅");
    expect(html).toContain('aria-label="复制标准输出"');
    expect(html).not.toContain('aria-label="复制程序输出"');
    expect(html.match(/tabindex="0"/gi)).toHaveLength(2);
  });

  it("renders potentially hostile output as text", () => {
    const html = renderToStaticMarkup(<OutputComparison actual="<script>alert(1)</script>" caseIndex={1} expected="safe" />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;");
  });

  it("explains when the visible output cannot locate a truncated mismatch", () => {
    const value = truncateCppOutput("a".repeat(6000));
    const html = renderToStaticMarkup(<OutputComparison actual={value} caseIndex={1} expected={value} />);
    expect(html).toContain("输出已截断，差异可能在未显示的部分。");
    expect(html).not.toContain("<mark");
    expect(html).not.toContain("首处差异");
  });
});
