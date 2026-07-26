import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveProblemContent } from "./ObjectiveProblemContent";
import { ObjectiveAiExplanationProvider } from "./StaffObjectiveAiExplanation";
import {
  StaffObjectiveAnswerToggle,
  StaffObjectiveAnswerVisibilityProvider,
} from "./StaffObjectiveAnswerVisibility";

describe("ObjectiveProblemContent", () => {
  it("renders inline powers and subscripts with KaTeX", () => {
    const html = renderToStaticMarkup(
      <ObjectiveProblemContent
        items={[
          {
            kind: "choice",
            stem: "三进制数 $2102_{(3)}$，以及 $2^6$。",
            options: [
              { label: "A", text: "$63$" },
              { label: "B", text: "$65$" },
            ],
            score: 2,
          },
        ]}
      />,
    );

    expect(html).toContain("katex");
    expect(html).toContain("2102");
    expect(html).toContain("msub");
    expect(html).toContain("msup");
  });

  it("renders Luogu question images but leaves untrusted image markdown as text", () => {
    const html = renderToStaticMarkup(
      <ObjectiveProblemContent
        items={[
          {
            kind: "judge",
            stem: "![](https://cdn.luogu.com.cn/upload/image_hosting/test.png)",
            options: [
              { label: "A", text: "正确" },
              { label: "B", text: "错误" },
            ],
            score: 2,
          },
          {
            kind: "judge",
            stem: "![](https://example.com/untrusted.png)",
            options: [
              { label: "A", text: "正确" },
              { label: "B", text: "错误" },
            ],
            score: 2,
          },
        ]}
      />,
    );

    expect(html).toContain('src="https://cdn.luogu.com.cn/upload/image_hosting/test.png"');
    expect(html).not.toContain('src="https://example.com/untrusted.png"');
    expect(html).toContain("https://example.com/untrusted.png");
  });

  it("only renders staff AI explanation controls when explicitly enabled", () => {
    const item = {
      answer: "A",
      kind: "judge" as const,
      options: [
        { label: "A", text: "正确" },
        { label: "B", text: "错误" },
      ],
      score: 2,
      stem: "这是一道判断题。",
    };
    const plainHtml = renderToStaticMarkup(
      <ObjectiveProblemContent items={[item]} showAnswers />,
    );
    const staffHtml = renderToStaticMarkup(
      <ObjectiveAiExplanationProvider
        canForceRegenerate
        problemId={10}
      >
        <ObjectiveProblemContent
          items={[item]}
          showAiExplanationActions
          showAnswers
        />
      </ObjectiveAiExplanationProvider>,
    );
    expect(plainHtml).not.toContain("AI 解析");
    expect(staffHtml).toContain("AI 解析");
  });

  it("keeps staff answers hidden by default behind one page-level toggle", () => {
    const html = renderToStaticMarkup(
      <StaffObjectiveAnswerVisibilityProvider>
        <StaffObjectiveAnswerToggle />
        <ObjectiveProblemContent
          items={[
            {
              answer: "B",
              kind: "choice",
              options: [
                { label: "A", text: "错误选项" },
                { label: "B", text: "正确选项" },
              ],
              score: 2,
              stem: "请选择正确答案。",
            },
          ]}
          staffAnswerVisibility
        />
      </StaffObjectiveAnswerVisibilityProvider>,
    );

    expect(html).toContain("显示答案");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("答案 B");
  });
});
