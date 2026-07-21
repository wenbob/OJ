import type { ObjectiveItem } from "./objectiveProblem";

export type LuoguObjectiveDocument = {
  id: number;
  name: string;
  items: ObjectiveItem[];
};

const officialNamePattern = /^GESP\s+(\d{4})(\d{2})\s+C\+\+\s+(一级|二级|三级)$/;

export function parseOfficialObjectiveName(name: string) {
  const match = officialNamePattern.exec(name);
  if (!match) {
    throw new Error(`无法识别洛谷试题标题《${name}》`);
  }
  return {
    compactDate: `${match[1]}${match[2]}`,
    level: match[3],
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

/**
 * 标准导入格式要求每个选项占一行。洛谷原文偶尔会在选项中使用
 * 多行代码块，因此这里将代码块压成行内代码，其余换行压成空格。
 * 数学公式的 $...$ 标记保持原样，导入后由 KaTeX 渲染。
 */
export function flattenObjectiveOptionText(value: string) {
  const flattenedFences = value.replace(
    /```[^\n]*\n([\s\S]*?)```/g,
    (_match, code: string) => {
      const compactCode = code.replace(/\s+/g, " ").trim().replace(/`/g, "\\`");
      return compactCode ? `\`${compactCode}\`` : "";
    },
  );
  return flattenedFences.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function serializeStandardObjectiveMarkdown(
  document: LuoguObjectiveDocument,
) {
  const { level, month, year } = parseOfficialObjectiveName(document.name);
  const lines = [
    `# GESP ${year}年${month}月 C++ ${level} 选择判断真题`,
    "",
    "## 题型",
    "",
    "选择判断",
    "",
    "## 难度",
    "",
    "入门",
    "",
    "## 分类",
    "",
    `GESP ${level}`,
    "",
    "## 题目描述",
    "",
    "请按题号顺序作答，每行填写一个答案字母。",
    "",
    "## 客观题",
    "",
  ];

  document.items.forEach((item, index) => {
    lines.push(`### 第 ${index + 1} 题`, "", item.stem, "");
    item.options.forEach((option) => {
      lines.push(`${option.label}. ${flattenObjectiveOptionText(option.text)}`);
    });
    lines.push("", `答案：${item.answer}`, `分值：${item.score}`, "");
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

export function serializeRawObjectiveMarkdown(document: LuoguObjectiveDocument) {
  const choiceCount = document.items.filter((item) => item.kind === "choice").length;
  const judgeCount = document.items.length - choiceCount;
  const lines = [
    `# ${document.name} 选择判断真题`,
    "",
    `来源: https://ti.luogu.com.cn/problemset/${document.id}`,
    "",
    `题目数量: ${document.items.length}`,
    "",
    `选择题: ${choiceCount}`,
    "",
    `判断题: ${judgeCount}`,
    "",
  ];

  for (const kind of ["choice", "judge"] as const) {
    const items = document.items.filter((item) => item.kind === kind);
    if (items.length === 0) continue;
    lines.push(kind === "choice" ? "## 选择题" : "## 判断题", "");
    items.forEach((item) => {
      const globalIndex = document.items.indexOf(item) + 1;
      lines.push(
        `### ${globalIndex}. ${kind === "choice" ? "单选题" : "判断题"}`,
        `分值: ${item.score} 分`,
        "",
        item.stem,
        "",
      );
      item.options.forEach((option) => {
        lines.push(`${option.label}. ${flattenObjectiveOptionText(option.text)}`);
      });
      const answerText = item.options.find((option) => option.label === item.answer)?.text;
      lines.push(
        "",
        `答案: ${item.answer}${answerText ? ` (${flattenObjectiveOptionText(answerText)})` : ""}`,
        "",
      );
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
