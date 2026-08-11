import { describe, expect, it } from "vitest";
import { applyProblemDefaults, validateParsedProblems } from "./problemImport";
import { parseProblemMarkdown, parseProblemsMarkdown } from "./markdownParser";

const validMarkdown = `# A+B 问题

## 难度

入门

## 分类

基础语法

## 题目描述

输入两个整数 a 和 b，输出它们的和。

## 输入格式

一行两个整数 a 和 b。

## 输出格式

输出一个整数。

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
10 20
\`\`\`

### 输出样例 2

\`\`\`text
30
\`\`\`

## 数据范围

-10^9 <= a,b <= 10^9
`;

const oddEvenMarkdown = `# 判断奇偶

## 难度

提高

## 分类

条件判断

## 题目描述

输入一个整数 n，判断它是奇数还是偶数。

## 输入格式

一行一个整数 n。

## 输出格式

如果是偶数，输出 even；如果是奇数，输出 odd。

## 样例

### 输入样例 1

\`\`\`text
4
\`\`\`

### 输出样例 1

\`\`\`text
even
\`\`\`

### 输入样例 2

\`\`\`text
5
\`\`\`

### 输出样例 2

\`\`\`text
odd
\`\`\`

## 数据范围

1 <= n <= 100000
`;

const objectiveMarkdown = `# GESP 选择判断练习

## 题型

选择判断

## 难度

入门

## 分类

GESP 一级

## 题目描述

请按顺序作答。

## 客观题

### 第 1 题

下列不可做变量名的是（ ）。

A. five-Star
B. five_star
C. fiveStar
D. _fiveStar

答案：A
分值：2

### 第 2 题

break 可以终止当前循环。（ ）

A. 正确
B. 错误

答案：A
分值：3
`;

describe("parseProblemMarkdown", () => {
  it("单题 Markdown 中包含难度和分类，可以正确解析", () => {
    const parsed = parseProblemMarkdown(validMarkdown);

    expect(parsed.title).toBe("A+B 问题");
    expect(parsed.problemType).toBe("programming");
    expect(parsed.difficulty).toBe("入门");
    expect(parsed.category).toBe("基础语法");
    expect(parsed.description).toContain("两个整数");
    expect(parsed.inputDescription).toContain("一行");
    expect(parsed.outputDescription).toContain("一个整数");
    expect(parsed.samples).toEqual([
      { input: "1 2", output: "3" },
      { input: "10 20", output: "30" },
    ]);
    expect(parsed.dataRange).toContain("-10^9");
  });

  it("样例代码块内容解析正确，不包含样例标题或代码围栏", () => {
    const parsed = parseProblemMarkdown(validMarkdown);

    expect(parsed.samples[0].input).toBe("1 2");
    expect(parsed.samples[0].input).not.toContain("输入样例");
    expect(parsed.samples[0].input).not.toContain("```");
    expect(parsed.samples[0].output).toBe("3");
    expect(parsed.samples[0].output).not.toContain("输出样例");
    expect(parsed.samples[0].output).not.toContain("```");
  });

  it("按样例编号配对并允许编号块乱序出现", () => {
    const reordered = validMarkdown.replace(
      /## 样例[\s\S]*?## 数据范围/,
      `## 样例

### 输入样例 2

\`\`\`text
10 20
\`\`\`

### 输出样例 1

\`\`\`text
3
\`\`\`

### 输入样例 1

\`\`\`text
1 2
\`\`\`

### 输出样例 2

\`\`\`text
30
\`\`\`

## 数据范围`,
    );

    expect(parseProblemMarkdown(reordered).samples).toEqual([
      { input: "1 2", output: "3" },
      { input: "10 20", output: "30" },
    ]);
  });

  it("拒绝重复样例编号，避免覆盖或错配答案", () => {
    const duplicate = validMarkdown.replace(
      "### 输入样例 2",
      "### 输入样例 1",
    );

    expect(() => parseProblemMarkdown(duplicate)).toThrow("样例 1 的输入重复");
  });

  it("代码围栏内的二级标题不会截断或冒充题目章节", () => {
    const fencedHeading = validMarkdown.replace(
      "输入两个整数 a 和 b，输出它们的和。",
      `下面是题面中的原样文本：

\`\`\`text
## 输入格式
这里不是章节
\`\`\`

继续阅读题目。`,
    );
    const parsed = parseProblemMarkdown(fencedHeading);

    expect(parsed.description).toContain("## 输入格式");
    expect(parsed.description).toContain("继续阅读题目");
    expect(parsed.inputDescription).toBe("一行两个整数 a 和 b。");
  });

  it("缺少标题时报错", () => {
    expect(() => parseProblemMarkdown(validMarkdown.replace("# A+B 问题", ""))).toThrow(
      "缺少试题名称",
    );
  });

  it("缺少题目描述时报错", () => {
    expect(() =>
      parseProblemMarkdown(validMarkdown.replace("## 题目描述", "## 题意")),
    ).toThrow("缺少题目描述");
  });

  it("缺少难度且没有默认难度时报错", () => {
    expect(() =>
      parseProblemMarkdown(validMarkdown.replace(/## 难度[\s\S]*?## 分类/, "## 分类")),
    ).toThrow("缺少难度");
  });

  it("缺少分类且没有默认分类时报错", () => {
    expect(() =>
      parseProblemMarkdown(validMarkdown.replace(/## 分类[\s\S]*?## 题目描述/, "## 题目描述")),
    ).toThrow("缺少分类");
  });

  it("缺少难度时，如果传了默认难度，可以用默认难度兜底", () => {
    const parsed = parseProblemMarkdown(
      validMarkdown.replace(/## 难度[\s\S]*?## 分类/, "## 分类"),
      { defaultDifficulty: "普及" },
    );

    expect(parsed.difficulty).toBe("普及");
    expect(parsed.category).toBe("基础语法");
  });

  it("缺少分类时，如果传了默认分类，可以用默认分类兜底", () => {
    const parsed = parseProblemMarkdown(
      validMarkdown.replace(/## 分类[\s\S]*?## 题目描述/, "## 题目描述"),
      { defaultCategory: "综合练习" },
    );

    expect(parsed.difficulty).toBe("入门");
    expect(parsed.category).toBe("综合练习");
  });

  it("样例输入输出数量不匹配时报错", () => {
    const markdown = validMarkdown.replace(
      /### 输出样例 1[\s\S]*?```[\t ]*\n\n### 输入样例 2/,
      "### 输入样例 2",
    );

    expect(() => parseProblemMarkdown(markdown)).toThrow(
      "样例输入和样例输出数量不匹配",
    );
  });

  it("样例代码块为空时报错", () => {
    const markdown = validMarkdown.replace("1 2", "");

    expect(() => parseProblemMarkdown(markdown)).toThrow("样例代码块内容为空");
  });

  it("单题 Markdown 只有一组样例时报错", () => {
    const markdown = validMarkdown.replace(
      /### 输入样例 2[\s\S]*?```[\t ]*\n\n## 数据范围/,
      "## 数据范围",
    );

    expect(() => parseProblemMarkdown(markdown)).toThrow(
      "至少需要两组样例，当前只有 1 组",
    );
  });

  it("选择判断 Markdown 可以解析小题、选项、答案和分值", () => {
    const parsed = parseProblemMarkdown(objectiveMarkdown);

    expect(parsed.problemType).toBe("objective");
    expect(parsed.samples).toEqual([]);
    expect(parsed.objectiveItems).toHaveLength(2);
    expect(parsed.objectiveItems?.[0]).toMatchObject({
      kind: "choice",
      answer: "A",
      score: 2,
    });
    expect(parsed.objectiveItems?.[1]).toMatchObject({
      kind: "judge",
      answer: "A",
      score: 3,
    });
  });

  it("选择判断题缺少答案时返回明确错误", () => {
    expect(() =>
      parseProblemMarkdown(objectiveMarkdown.replace("答案：A", "")),
    ).toThrow("第 1 小题缺少答案");
  });

  it("选择判断题分值必须是正整数", () => {
    expect(() =>
      parseProblemMarkdown(objectiveMarkdown.replace("分值：2", "分值：1.5")),
    ).toThrow("第 1 小题缺少分值");
  });

  it("选择判断题选项不能只写字母后另起代码块", () => {
    const markdown = objectiveMarkdown.replace(
      "A. five-Star",
      `A.
\`\`\`cpp
int main() { return 0; }
\`\`\``,
    );

    expect(() => parseProblemMarkdown(markdown)).toThrow(
      "第 1 小题选项 A 缺少内容",
    );
  });
});

describe("parseProblemsMarkdown", () => {
  it("接受 Windows UTF-8 BOM 开头的批量文档", () => {
    const result = parseProblemsMarkdown(`\uFEFF${validMarkdown}`);

    expect(result.errors).toEqual([]);
    expect(result.problems).toHaveLength(1);
  });

  it("单题 Markdown 正常解析", () => {
    const result = parseProblemsMarkdown(validMarkdown);

    expect(result.errors).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].title).toBe("A+B 问题");
  });

  it("多题 Markdown 中每道题都有不同分类和难度，可以正确解析", () => {
    const result = parseProblemsMarkdown(`${validMarkdown}\n\n${oddEvenMarkdown}`);

    expect(result.errors).toEqual([]);
    expect(result.problems.map((problem) => problem.title)).toEqual([
      "A+B 问题",
      "判断奇偶",
    ]);
    expect(result.problems.map((problem) => problem.category)).toEqual([
      "基础语法",
      "条件判断",
    ]);
    expect(result.problems.map((problem) => problem.difficulty)).toEqual([
      "入门",
      "提高",
    ]);
  });

  it("多题中每道题多组样例正常解析", () => {
    const multiSample = validMarkdown.replace(
      "## 数据范围",
      `### 输入样例 3

\`\`\`text
3 5
\`\`\`

### 输出样例 3

\`\`\`text
8
\`\`\`

## 数据范围`,
    );
    const result = parseProblemsMarkdown(
      `${multiSample}\n\n${multiSample.replace("A+B 问题", "求和 2")}`,
    );

    expect(result.errors).toEqual([]);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0].samples).toHaveLength(3);
    expect(result.problems[1].samples).toHaveLength(3);
  });

  it("某一道题缺少题目描述，返回对应错误", () => {
    const bad = validMarkdown.replace("## 题目描述", "## 题意").replace("A+B 问题", "坏题");
    const result = parseProblemsMarkdown(`${validMarkdown}\n\n${bad}`);

    expect(result.errors).toContain("第 2 题《坏题》缺少题目描述");
  });

  it("某一道题样例输入输出数量不匹配，返回对应错误", () => {
    const bad = validMarkdown
      .replace(/### 输出样例 1[\s\S]*?```[\t ]*\n\n### 输入样例 2/, "### 输入样例 2")
      .replace("A+B 问题", "坏题");
    const result = parseProblemsMarkdown(`${validMarkdown}\n\n${bad}`);

    expect(result.errors).toContain("第 2 题《坏题》样例输入和样例输出数量不匹配");
  });

  it("某一道题样例代码块为空，返回对应错误", () => {
    const bad = validMarkdown.replace("1 2", "").replace("A+B 问题", "坏题");
    const result = parseProblemsMarkdown(`${validMarkdown}\n\n${bad}`);

    expect(result.errors).toContain("第 2 题《坏题》样例代码块内容为空");
  });

  it("文件中没有任何一级标题时，返回错误", () => {
    const result = parseProblemsMarkdown("## 题目描述\n\n没有一级标题。");

    expect(result.problems).toEqual([]);
    expect(result.errors).toContain("缺少试题名称");
  });

  it("文件中存在未闭合代码块时返回行号错误", () => {
    const result = parseProblemsMarkdown(`# 坏题

## 难度

入门

## 分类

基础语法

## 题目描述

\`\`\`cpp
int main() {
  return 0;
}
`);

    expect(result.errors).toContain(
      "Markdown 存在未闭合代码块：请检查第 13 行附近或之前的 ``` 标记是否成对",
    );
  });
});

describe("problem import defaults", () => {
  it("导入前校验会用默认难度和默认分类兜底", () => {
    const parsed = parseProblemMarkdown(validMarkdown);
    const problemWithoutMeta = {
      ...parsed,
      difficulty: "",
      category: "",
    };

    const problems = applyProblemDefaults([problemWithoutMeta], {
      defaultCategory: "综合练习",
      defaultDifficulty: "普及",
    });

    expect(problems[0].difficulty).toBe("普及");
    expect(problems[0].category).toBe("综合练习");
    expect(validateParsedProblems(problems)).toEqual([]);
  });
});
