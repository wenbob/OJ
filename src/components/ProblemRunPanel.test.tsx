import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProblemRunPanel } from "./ProblemRunPanel";

describe("ProblemRunPanel", () => {
  it("renders both trial modes and keeps the formal submit action separate", () => {
    const html = renderToStaticMarkup(
      <ProblemRunPanel
        code="int main(){}"
        problemId={12}
        sampleCount={2}
        submitPending={false}
      >
        <button type="button">提交代码</button>
      </ProblemRunPanel>,
    );

    expect(html).toContain("运行样例");
    expect(html).toContain("自定义输入");
    expect(html).toContain("在线自测");
    expect(html).not.toContain("将一次编译并运行全部");
    expect(html).not.toContain("样例通过不代表全部测试点通过");
    expect(html).toContain("提交代码");
  });

  it("keeps custom input available when a problem has no public samples", () => {
    const html = renderToStaticMarkup(
      <ProblemRunPanel
        code="int main(){}"
        problemId={12}
        sampleCount={0}
        submitPending={false}
      >
        <button type="button">提交代码</button>
      </ProblemRunPanel>,
    );

    expect(html).toContain("该题暂无公开样例");
    expect(html).toContain("自定义输入");
  });
});
