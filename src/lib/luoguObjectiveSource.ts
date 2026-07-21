import katex from "katex";
import type { ObjectiveItem } from "./objectiveProblem";
import { validateObjectiveItems } from "./objectiveProblem";

type LuoguQuestion = {
  allowMultiChoices?: boolean;
  choices?: unknown;
  correctAnswers?: unknown;
  score?: number;
};

type LuoguProblem = {
  description?: unknown;
  id?: number;
  questions?: unknown;
  score?: number;
};

export type LuoguProblemset = {
  id: number;
  name: string;
  problems: LuoguProblem[];
};

export type LuoguInjection = {
  currentData?: {
    problemset?: unknown;
    problemsets?: unknown;
  };
};

const officialTitlePattern =
  /GESP\s+(?:(\d{4})(\d{2})|(\d{4})年(\d{1,2})月)\s+C\+\+\s+(一级|二级|三级)/;

export function getOfficialLuoguProblemsetName(localTitle: string) {
  const match = officialTitlePattern.exec(localTitle);
  if (!match) return null;

  const year = match[1] ?? match[3];
  const month = (match[2] ?? match[4]).padStart(2, "0");
  const level = match[5];
  return `GESP ${year}${month} C++ ${level}`;
}

export function parseLuoguProblemsetHtml(html: string): LuoguProblemset {
  const injection = parseLuoguInjectionHtml(html);
  const problemset = injection.currentData?.problemset;
  if (!isRecord(problemset)) {
    throw new Error("洛谷有题页面未返回试题信息");
  }

  const id = problemset.id;
  const name = problemset.name;
  const problems = problemset.problems;
  if (
    typeof id !== "number" ||
    typeof name !== "string" ||
    !Array.isArray(problems)
  ) {
    throw new Error("洛谷有题试题信息不完整");
  }

  return { id, name, problems: problems as LuoguProblem[] };
}

export function parseLuoguInjectionHtml(html: string): LuoguInjection {
  const match =
    /window\._feInjection\s*=\s*JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/.exec(
      html,
    );
  if (!match) {
    throw new Error("洛谷有题页面缺少可解析的题目数据");
  }

  let injection: LuoguInjection;
  try {
    injection = JSON.parse(decodeURIComponent(match[1])) as LuoguInjection;
  } catch {
    throw new Error("洛谷有题页面的题目数据格式无效");
  }

  return injection;
}

export function convertLuoguProblemset(problemset: LuoguProblemset) {
  const items = problemset.problems.map((problem, problemIndex) => {
    const questions = Array.isArray(problem.questions)
      ? (problem.questions as LuoguQuestion[])
      : [];
    if (questions.length !== 1) {
      throw new Error(
        `${problemset.name} 第 ${problemIndex + 1} 题不是单一选择判断题`,
      );
    }

    const question = questions[0];
    const choices = Array.isArray(question.choices)
      ? question.choices.filter((choice): choice is string => typeof choice === "string")
      : [];
    const correctAnswers = Array.isArray(question.correctAnswers)
      ? question.correctAnswers.filter(
          (answer): answer is string => typeof answer === "string",
        )
      : [];
    if (choices.length < 2 || choices.length > 4) {
      throw new Error(
        `${problemset.name} 第 ${problemIndex + 1} 题的选项数量不是 2 至 4 个`,
      );
    }
    if (question.allowMultiChoices || correctAnswers.length !== 1) {
      throw new Error(
        `${problemset.name} 第 ${problemIndex + 1} 题不是单答案题`,
      );
    }
    if (typeof problem.description !== "string") {
      throw new Error(`${problemset.name} 第 ${problemIndex + 1} 题缺少题干`);
    }

    let normalizedChoices = choices.map(normalizeLuoguText);
    let normalizedStem = normalizeLuoguText(problem.description);
    const embeddedChoices = extractEmbeddedObjectiveChoices(
      normalizedStem,
      normalizedChoices,
    );
    if (embeddedChoices) {
      normalizedStem = embeddedChoices.stem;
      normalizedChoices = embeddedChoices.choices;
    }
    const judge =
      normalizedChoices.length === 2 &&
      normalizedChoices[0] === "正确" &&
      normalizedChoices[1] === "错误";
    const score = question.score ?? problem.score;
    if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
      throw new Error(`${problemset.name} 第 ${problemIndex + 1} 题分值无效`);
    }

    return {
      answer: correctAnswers[0].trim().toUpperCase(),
      kind: judge ? "judge" : "choice",
      options: normalizedChoices.map((text, optionIndex) => ({
        label: String.fromCharCode(65 + optionIndex),
        text,
      })),
      score,
      stem: normalizedStem,
    } satisfies ObjectiveItem;
  });

  const errors = validateObjectiveItems(items);
  if (errors.length > 0) {
    throw new Error(`${problemset.name} 数据校验失败：${errors[0]}`);
  }
  items.forEach((item, index) => {
    validateLuoguMathMarkup(item.stem, `${problemset.name} 第 ${index + 1} 题题干`);
    item.options.forEach((option) =>
      validateLuoguMathMarkup(
        option.text,
        `${problemset.name} 第 ${index + 1} 题选项 ${option.label}`,
      ),
    );
  });
  return items;
}

/**
 * 少数洛谷试题把完整选项排在 description 末尾，而 questions.choices
 * 仅保存 A/B/C/D 四个占位字母。将这类内容恢复成真正的选项，避免导入
 * 时把题干内的“A.”误判为空选项。
 */
export function extractEmbeddedObjectiveChoices(
  stem: string,
  choices: string[],
) {
  const expectedLabels = choices.map((choice) => choice.trim().toUpperCase());
  if (
    expectedLabels.length < 2 ||
    expectedLabels.some((label, index) => label !== String.fromCharCode(65 + index))
  ) {
    return null;
  }

  const matches = [...stem.matchAll(/(?:^|\n{1,2})([A-D])\.[ \t]*\n/g)];
  if (
    matches.length !== expectedLabels.length ||
    matches.some((match, index) => match[1] !== expectedLabels[index])
  ) {
    return null;
  }

  const extracted = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? stem.length;
    return normalizeLuoguText(stem.slice(start, end));
  });
  if (extracted.some((choice) => !choice)) return null;

  return {
    choices: extracted,
    stem: stem.slice(0, matches[0].index).trim(),
  };
}

export function normalizeLuoguText(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    // 个别洛谷题干在一个空围栏后紧接带语言的围栏，例如
    // ``` + ```cpp。两者实际表示同一个代码块，需合并后再导入。
    .replace(/```[ \t]*\n```([A-Za-z0-9_+-]*)[ \t]*\n/g, "```$1\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  const fenceCount = normalized.split("\n").filter((line) => /^\s*```/.test(line)).length;
  return fenceCount % 2 === 1 ? `${normalized}\n\`\`\`` : normalized;
}

export function validateLuoguMathMarkup(value: string, label = "文本") {
  const withoutCode = value
    .replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
  const mathPattern = /\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\n])+\$/g;
  const formulas = withoutCode.match(mathPattern) ?? [];
  const unmatched = withoutCode.replace(mathPattern, "");
  // 洛谷原文可能把非法标识符写成 $1，也可能出现美元金额；单独的
  // $ 在 Markdown 中只是普通字符。只有残留片段明显含有公式结构时，
  // 才把它判定为漏写了闭合 $。
  if (/\$[^$\n]*[\\^_{}]/.test(unmatched)) {
    throw new Error(`${label}含有未闭合的 $ 数学公式标记`);
  }

  for (const formula of formulas) {
    const displayMode = formula.startsWith("$$");
    const source = formula.slice(displayMode ? 2 : 1, displayMode ? -2 : -1);
    try {
      katex.renderToString(source, {
        displayMode,
        strict: false,
        throwOnError: true,
      });
    } catch (error) {
      throw new Error(
        `${label}的数学公式无法渲染：${error instanceof Error ? error.message : source}`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
