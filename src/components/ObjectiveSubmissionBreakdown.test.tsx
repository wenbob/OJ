import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatObjectiveSubmittedAnswer,
  ObjectiveSubmissionBreakdown,
} from "./ObjectiveSubmissionBreakdown";

describe("ObjectiveSubmissionBreakdown", () => {
  it("shows each item result and the submitted answer without standard answers", () => {
    const caseResults = [
      {
        actualOutput: "A",
        caseIndex: 1,
        expectedOutput: "STANDARD_ANSWER_MUST_STAY_HIDDEN",
        status: "Accepted",
      },
      {
        actualOutput: " C ",
        caseIndex: 2,
        expectedOutput: "B",
        status: "Wrong Answer",
      },
      {
        actualOutput: "",
        caseIndex: 3,
        expectedOutput: "D",
        status: "Wrong Answer",
      },
    ];

    const html = renderToStaticMarkup(
      <ObjectiveSubmissionBreakdown
        caseResults={caseResults}
        detailHref="/student/submissions/12"
      />,
    );

    expect(html).toContain("答对 1/3 小题");
    expect(html).toContain("第 1 题");
    expect(html).toContain("第 2 题");
    expect(html).toContain("第 3 题");
    expect(html).toContain("正确");
    expect(html).toContain("错误");
    expect(html).toContain("我的答案");
    expect(html).toContain("未作答");
    expect(html).toContain("/student/submissions/12");
    expect(html).toContain("查看完整提交详情");
    expect(html).not.toContain("STANDARD_ANSWER_MUST_STAY_HIDDEN");
  });

  it("normalizes blank submitted answers for review", () => {
    expect(formatObjectiveSubmittedAnswer(null)).toBe("未作答");
    expect(formatObjectiveSubmittedAnswer("   ")).toBe("未作答");
    expect(formatObjectiveSubmittedAnswer(" b ")).toBe("b");
  });
});
