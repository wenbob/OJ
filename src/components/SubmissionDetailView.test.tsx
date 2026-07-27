import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmissionDetailView } from "./SubmissionDetailView";

describe("SubmissionDetailView objective feedback", () => {
  it("renders localized correctness and never renders the expected answer", () => {
    const html = renderToStaticMarkup(
      <SubmissionDetailView
        problemHref="/student/problems/3"
        showCopyCode={false}
        submission={{
          caseResults: [
            {
              actualOutput: "A",
              caseIndex: 1,
              errorMessage: "答案不一致",
              expectedOutput: "STANDARD_ANSWER_MUST_STAY_HIDDEN",
              id: 10,
              input: "第 1 小题\n题干",
              runtimeMs: 0,
              status: "Wrong Answer",
            },
          ],
          code: "A",
          createdAt: new Date("2026-07-26T00:00:00.000Z"),
          errorMessage: "选择判断题答案与标准答案不一致",
          id: 8,
          language: "Objective",
          passedCount: 0,
          problem: { id: 3, title: "选择判断测试" },
          runtimeMs: 0,
          status: "Wrong Answer",
          totalCount: 1,
          user: { username: "student" },
        }}
      />,
    );

    expect(html).toContain("逐题结果与作答内容");
    expect(html).toContain("第 1 题");
    expect(html).toContain("错误");
    expect(html).toContain("我的答案");
    expect(html).not.toContain("STANDARD_ANSWER_MUST_STAY_HIDDEN");
  });
});
