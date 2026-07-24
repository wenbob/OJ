import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcceptedProblemIndicator } from "./AcceptedProblemIndicator";

describe("AcceptedProblemIndicator", () => {
  it("links programming problems to the accepted code submission", () => {
    const html = renderToStaticMarkup(
      <AcceptedProblemIndicator
        problemTitle="连续整除"
        problemType="programming"
        submissionId={42}
      />,
    );

    expect(html).toContain("已通过");
    expect(html).toContain("查看通过代码");
    expect(html).toContain('href="/admin/submissions/42"');
    expect(html).toContain('aria-label="查看通过代码：连续整除"');
  });

  it("uses answer wording for objective problems", () => {
    const html = renderToStaticMarkup(
      <AcceptedProblemIndicator
        problemTitle="选择判断真题"
        problemType="objective"
        submissionId={77}
      />,
    );

    expect(html).toContain("查看通过答案");
    expect(html).not.toContain("查看通过代码");
    expect(html).toContain('href="/admin/submissions/77"');
  });
});
