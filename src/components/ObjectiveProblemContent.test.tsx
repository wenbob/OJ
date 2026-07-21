import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveProblemContent } from "./ObjectiveProblemContent";

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
});
