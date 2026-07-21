import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProblemRichText } from "./ProblemRichText";

describe("ProblemRichText", () => {
  it("renders representative GESP inline and display formulas with KaTeX", () => {
    const html = renderToStaticMarkup(
      <ProblemRichText
        className="content"
        codeClassName="code"
        value={`税额为 $(1000.0 - 800.0) \\times 20\\% = 40.00$，且 $2 \\le m \\le 10^8$。

$$0 \\ 2 \\ 0 \\ 3 \\ 4 \\ 1 \\ 9$$`}
      />,
    );

    expect(html).toContain("katex");
    expect(html).toContain("times");
    expect(html).toContain("mord");
    expect(html).not.toContain("$2");
  });

  it("does not parse dollar signs inside inline or fenced code", () => {
    const html = renderToStaticMarkup(
      <ProblemRichText
        className="content"
        codeClassName="code"
        value={'密码是 `!@#$`。\n\n```cpp\nstring value = "$100";\n```'}
      />,
    );

    expect(html).toContain("!@#$");
    expect(html).toContain("$100");
    expect(html).not.toContain("katex");
  });

  it("renders repeated bold spans without recursive regex loops", () => {
    const html = renderToStaticMarkup(
      <ProblemRichText
        className="content"
        codeClassName="code"
        value="输出一个浮点数，**保留两位小数**。**完全平方数：** $9 = 3^2$。"
      />,
    );

    expect(html.match(/<strong>/g)).toHaveLength(2);
    expect(html).toContain("保留两位小数");
    expect(html).toContain("katex");
  });

  it("renders Luogu tables with formulas and hides the table directive", () => {
    const html = renderToStaticMarkup(
      <ProblemRichText
        className="content"
        codeClassName="code"
        value={`::cute-table{tuack}

| 数据点编号 | 数据范围 | 特殊性质 |
|:-:|:-:|:-:|
| $1,2$ | $2 \\le m \\le 100$ | 无 |`}
      />,
    );

    expect(html).toContain("<table");
    expect(html).toContain("katex");
    expect(html).not.toContain("cute-table");
  });
});
