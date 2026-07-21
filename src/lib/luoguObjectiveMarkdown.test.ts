import { describe, expect, it } from "vitest";
import { parseProblemMarkdown } from "./markdownParser";
import {
  flattenObjectiveOptionText,
  serializeStandardObjectiveMarkdown,
} from "./luoguObjectiveMarkdown";

describe("Luogu objective Markdown", () => {
  it("keeps powers and subscripts when standard Markdown is imported", () => {
    const markdown = serializeStandardObjectiveMarkdown({
      id: 1207,
      name: "GESP 202603 C++ 三级",
      items: [
        {
          answer: "B",
          kind: "choice",
          options: [
            { label: "A", text: "$2^6-1$" },
            { label: "B", text: "$2^6$" },
          ],
          score: 2,
          stem: "三进制数 $2102_{(3)}$ 转换成十进制是（ ）。",
        },
      ],
    });

    const parsed = parseProblemMarkdown(markdown);
    expect(parsed.objectiveItems?.[0]).toMatchObject({
      stem: "三进制数 $2102_{(3)}$ 转换成十进制是（ ）。",
      options: [
        { label: "A", text: "$2^6-1$" },
        { label: "B", text: "$2^6$" },
      ],
    });
  });

  it("flattens multiline option code without changing formulas", () => {
    expect(flattenObjectiveOptionText("```cpp\nint x = 1;\nreturn x;\n``` $2^{10}$"))
      .toBe("`int x = 1; return x;` $2^{10}$");
  });
});
