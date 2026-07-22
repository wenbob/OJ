import { describe, expect, it, vi } from "vitest";
import type { ParsedProblemMarkdown } from "./markdownParser";
import { createImportedProblems } from "./problemImport";

function problem(
  title: string,
  problemType: "programming" | "objective",
): ParsedProblemMarkdown {
  return {
    title,
    problemType,
    difficulty: "入门",
    category: problemType === "programming" ? "循环" : "GESP 一级",
    description: "题目描述",
    inputDescription: problemType === "programming" ? "输入" : "",
    outputDescription: problemType === "programming" ? "输出" : "",
    samples:
      problemType === "programming"
        ? [
            { input: "1", output: "1" },
            { input: "2", output: "2" },
          ]
        : [],
    dataRange: "数据范围",
    objectiveItems:
      problemType === "objective"
        ? [
            {
              kind: "judge",
              stem: "判断题",
              options: [
                { label: "A", text: "正确" },
                { label: "B", text: "错误" },
              ],
              answer: "A",
              score: 1,
            },
          ]
        : undefined,
  };
}

describe("imported problem ordering", () => {
  it("places a batch at the front without reversing document order", async () => {
    const createdSortOrders: Array<{ title: string; sortOrder: number }> = [];
    const tx = {
      problem: {
        aggregate: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            _max: { sortOrder: where.problemType === "programming" ? 100 : 50 },
          }),
        ),
        create: vi.fn().mockImplementation(({ data }) => {
          createdSortOrders.push({ title: data.title, sortOrder: data.sortOrder });
          return Promise.resolve({ id: createdSortOrders.length });
        }),
      },
    };

    await createImportedProblems(
      tx as never,
      [
        problem("编程题一", "programming"),
        problem("编程题二", "programming"),
        problem("选择题一", "objective"),
      ],
    );

    expect(createdSortOrders).toEqual([
      { title: "编程题一", sortOrder: 102 },
      { title: "编程题二", sortOrder: 101 },
      { title: "选择题一", sortOrder: 51 },
    ]);
  });
});
