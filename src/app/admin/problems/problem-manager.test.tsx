import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProblemListSort } from "@/lib/problemOrdering";
import { ProblemManager } from "./problem-manager";

const problem = {
  id: 2,
  title: "第 2 题",
  description: "描述",
  inputDescription: "输入",
  outputDescription: "输出",
  sampleInput: "1",
  sampleOutput: "1",
  dataRange: "范围",
  difficulty: "入门",
  category: "基础语法",
  problemType: "programming" as const,
  objectiveItems: null,
  testCases: [
    { input: "1", output: "1", isSample: true },
    { input: "2", output: "2", isSample: true },
  ],
  submissions: 0,
  sortPosition: 1,
  canMoveUp: false,
  canMoveDown: true,
};

function renderManager(initialSort: ProblemListSort) {
  return renderToStaticMarkup(
    <ProblemManager
      categories={["基础语法", "循环"]}
      initialCategory=""
      initialPagination={{
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      }}
      initialProblems={[problem]}
      initialProblemType="programming"
      initialSort={initialSort}
      openCreateForm={false}
    />,
  );
}

describe("ProblemManager ordering controls", () => {
  it("renders custom drag handles while retaining arrow controls", () => {
    const html = renderManager("custom");

    expect(html).toContain("管理员查看排序");
    expect(html).toContain("标题升序");
    expect(html).toContain("最新创建优先");
    expect(html).toContain("调整分类顺序");
    expect(html).toContain("aria-label=\"拖动题目 第 2 题\"");
    expect(html).toContain("draggable=\"true\"");
    expect(html).toContain("aria-label=\"上移题目 第 2 题\"");
    expect(html).toContain("aria-label=\"下移题目 第 2 题\"");
    expect(html).not.toContain("保存当前题序");
  });

  it("offers saving a temporary view without rendering movement controls", () => {
    const html = renderManager("title-asc");

    expect(html).toContain("保存当前题序");
    expect(html).toContain("当前是管理员预览");
    expect(html).not.toContain("aria-label=\"拖动题目 第 2 题\"");
    expect(html).not.toContain("aria-label=\"上移题目 第 2 题\"");
    expect(html).not.toContain("aria-label=\"下移题目 第 2 题\"");
  });
});
