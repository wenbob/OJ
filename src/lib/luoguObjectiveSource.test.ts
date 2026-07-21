import { describe, expect, it } from "vitest";
import {
  convertLuoguProblemset,
  extractEmbeddedObjectiveChoices,
  getOfficialLuoguProblemsetName,
  parseLuoguProblemsetHtml,
  normalizeLuoguText,
  validateLuoguMathMarkup,
} from "./luoguObjectiveSource";

function htmlFor(value: unknown) {
  return `<script>window._feInjection = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(value))}"))</script>`;
}

describe("Luogu objective source", () => {
  it("normalizes both compact and Chinese date titles", () => {
    expect(getOfficialLuoguProblemsetName("GESP 202603 C++ 三级")).toBe(
      "GESP 202603 C++ 三级",
    );
    expect(
      getOfficialLuoguProblemsetName(
        "GESP 2026年3月 C++ 一级 选择判断真题",
      ),
    ).toBe("GESP 202603 C++ 一级");
    expect(getOfficialLuoguProblemsetName("GESP 选择判断练习")).toBeNull();
  });

  it("extracts and converts exact stems, formulas, answers and judge choices", () => {
    const problemset = parseLuoguProblemsetHtml(
      htmlFor({
        currentData: {
          problemset: {
            id: 1207,
            name: "GESP 202603 C++ 三级",
            problems: [
              {
                description: "三进制数 $2102_{(3)}$ 转换成十进制是（ ）。  ",
                questions: [
                  {
                    allowMultiChoices: false,
                    choices: ["63 ", " 65"],
                    correctAnswers: ["B"],
                    score: 2,
                  },
                ],
                score: 2,
              },
              {
                description: "表达式成立。（ ）",
                questions: [
                  {
                    allowMultiChoices: false,
                    choices: ["正确", "错误"],
                    correctAnswers: ["A"],
                    score: 2,
                  },
                ],
                score: 2,
              },
            ],
          },
        },
      }),
    );

    expect(convertLuoguProblemset(problemset)).toEqual([
      {
        answer: "B",
        kind: "choice",
        options: [
          { label: "A", text: "63" },
          { label: "B", text: "65" },
        ],
        score: 2,
        stem: "三进制数 $2102_{(3)}$ 转换成十进制是（ ）。",
      },
      {
        answer: "A",
        kind: "judge",
        options: [
          { label: "A", text: "正确" },
          { label: "B", text: "错误" },
        ],
        score: 2,
        stem: "表达式成立。（ ）",
      },
    ]);
  });

  it("rejects malformed or multi-answer source data", () => {
    expect(() => parseLuoguProblemsetHtml("<html></html>")).toThrow(
      "缺少可解析",
    );
    expect(() =>
      convertLuoguProblemset({
        id: 1,
        name: "bad",
        problems: [
          {
            description: "题目",
            questions: [
              {
                allowMultiChoices: true,
                choices: ["A", "B"],
                correctAnswers: ["A", "B"],
                score: 2,
              },
            ],
          },
        ],
      }),
    ).toThrow("不是单答案题");
  });

  it("validates powers, subscripts and malformed formula delimiters", () => {
    expect(() =>
      validateLuoguMathMarkup("$2^{10}$ 与 $2102_{(3)}$"),
    ).not.toThrow();
    expect(() => validateLuoguMathMarkup("错误的 $2^{10}"))
      .toThrow("未闭合");
    expect(() => validateLuoguMathMarkup("错误的 $2^{10$"))
      .toThrow("无法渲染");
    expect(() =>
      validateLuoguMathMarkup("代码中的 `$value` 不按公式处理"),
    ).not.toThrow();
    expect(() =>
      validateLuoguMathMarkup("非法变量名 $1 与价格 $100 都是普通文本"),
    ).not.toThrow();
  });

  it("merges duplicated source code fences", () => {
    expect(normalizeLuoguText("题干\n\n```\n```cpp\nint x;\n```"))
      .toBe("题干\n\n```cpp\nint x;\n```");
    expect(normalizeLuoguText("题干\n```cpp\nint x;"))
      .toBe("题干\n```cpp\nint x;\n```");
  });

  it("extracts choices embedded at the end of a source stem", () => {
    expect(
      extractEmbeddedObjectiveChoices(
        "请选择代码（ ）。\n\nA.\n1 `N = N - M`\n2 `M = M - N`\n\nB.\n1 `M = M - N`\n2 `N = N - M`",
        ["A", "B"],
      ),
    ).toEqual({
      stem: "请选择代码（ ）。",
      choices: [
        "1 `N = N - M`\n2 `M = M - N`",
        "1 `M = M - N`\n2 `N = N - M`",
      ],
    });
  });
});
