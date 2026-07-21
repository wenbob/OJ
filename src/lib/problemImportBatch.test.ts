import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_DOCUMENTS,
  parseProblemImportDocuments,
} from "./problemImportBatch";

const programming = `# 求和

## 难度
入门
## 分类
基础语法
## 题目描述
计算两个整数之和。
## 输入格式
输入两个整数。
## 输出格式
输出它们的和。
## 样例
### 输入样例 1
\`\`\`text
1 2
\`\`\`
### 输出样例 1
\`\`\`text
3
\`\`\`
### 输入样例 2
\`\`\`text
2 3
\`\`\`
### 输出样例 2
\`\`\`text
5
\`\`\`
## 数据范围
整数范围内。`;

const objective = `# 基础判断

## 难度
入门
## 分类
GESP 一级
## 题目描述
请选择正确答案。
## 客观题
### 第 1 题
1 + 1 等于 2。（ ）
A. 正确
B. 错误
答案：A
分值：2`;

describe("parseProblemImportDocuments", () => {
  it("parses multiple files independently and preserves source labels", () => {
    const result = parseProblemImportDocuments([
      { name: "编程题.md", markdown: programming },
      { name: "选择判断题.md", markdown: objective },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.documents).toEqual([
      { index: 0, name: "编程题.md", problemCount: 1, errors: [] },
      { index: 1, name: "选择判断题.md", problemCount: 1, errors: [] },
    ]);
    expect(result.problems.map((problem) => ({
      category: problem.category,
      file: problem.sourceFileName,
      type: problem.problemType,
    }))).toEqual([
      { category: "基础语法", file: "编程题.md", type: "programming" },
      { category: "GESP 一级", file: "选择判断题.md", type: "objective" },
    ]);
  });

  it("prefixes parse errors with the source file name", () => {
    const result = parseProblemImportDocuments([
      { name: "坏题.md", markdown: "没有一级标题" },
    ]);

    expect(result.problems).toEqual([]);
    expect(result.errors[0]).toContain("《坏题.md》");
    expect(result.errors[0]).toContain("缺少试题名称");
  });

  it("limits one batch to twenty documents", () => {
    const result = parseProblemImportDocuments(
      Array.from({ length: MAX_IMPORT_DOCUMENTS + 1 }, (_, index) => ({
        name: `${index}.md`,
        markdown: programming,
      })),
    );

    expect(result.errors).toEqual(["一次最多导入 20 个 Markdown 文档"]);
  });
});
