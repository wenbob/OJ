import type { ObjectiveItem, ProblemType } from "./objectiveProblem";
import { validateObjectiveItems } from "./objectiveProblem";

export type ParsedProblemMarkdown = {
  title: string;
  problemType: ProblemType;
  difficulty: string;
  category: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  samples: {
    input: string;
    output: string;
  }[];
  dataRange: string;
  objectiveItems?: ObjectiveItem[];
};

export type ParseProblemsOptions = {
  defaultCategory?: string;
  defaultDifficulty?: string;
};

export type ParseProblemsResult = {
  problems: ParsedProblemMarkdown[];
  errors: string[];
};

export class ProblemMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProblemMarkdownError";
  }
}

function cleanText(value?: string) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRequiredSection(markdown: string, heading: string, error: string) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m");
  const match = markdown.match(pattern);
  if (!match || match.index === undefined) {
    throw new ProblemMarkdownError(error);
  }

  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeadingIndex = rest.search(/^##\s+/m);
  const section =
    nextHeadingIndex >= 0 ? rest.slice(0, nextHeadingIndex) : rest;

  const value = section.trim();
  if (!value) throw new ProblemMarkdownError(error);
  return value;
}

function getOptionalSection(markdown: string, heading: string) {
  try {
    return getRequiredSection(markdown, heading, "");
  } catch {
    return undefined;
  }
}

function normalizeFenceContent(content: string) {
  return content.replace(/\n$/, "");
}

function findUnclosedFenceLine(markdown: string) {
  const lines = normalizeMarkdown(markdown).split("\n");
  let openLine: number | null = null;

  lines.forEach((line, index) => {
    if (!/^\s*```/.test(line)) return;
    openLine = openLine === null ? index + 1 : null;
  });

  return openLine;
}

function parseSamples(sampleSection: string) {
  const blockPattern =
    /^###\s*(输入样例|输出样例)\s*(\d+)?\s*\n+[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  const inputs: string[] = [];
  const outputs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(sampleSection)) !== null) {
    const kind = match[1];
    const content = normalizeFenceContent(match[3]);
    if (!content.trim()) {
      throw new ProblemMarkdownError("样例代码块内容为空");
    }

    if (kind === "输入样例") {
      inputs.push(content);
    } else {
      outputs.push(content);
    }
  }

  if (inputs.length === 0 && outputs.length === 0) {
    throw new ProblemMarkdownError("缺少样例");
  }

  if (inputs.length !== outputs.length) {
    throw new ProblemMarkdownError("样例输入和样例输出数量不匹配");
  }

  if (inputs.length < 2) {
    throw new ProblemMarkdownError(
      `至少需要两组样例，当前只有 ${inputs.length} 组`,
    );
  }

  return inputs.map((input, index) => ({
    input,
    output: outputs[index],
  }));
}

function normalizeProblemTypeLabel(value?: string): ProblemType {
  const label = value?.trim();
  if (label === "选择判断" || label === "客观题" || label === "选择题" || label === "判断题") {
    return "objective";
  }
  return "programming";
}

function parseObjectiveItems(section: string) {
  const normalized = normalizeMarkdown(section);
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    }
    if (!inFence && /^###\s+第\s*\d+\s*题/.test(line)) {
      if (current.length > 0) blocks.push(current.join("\n").trim());
      current = [line];
      continue;
    }
    if (current.length > 0) current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n").trim());

  if (blocks.length === 0) {
    throw new ProblemMarkdownError("缺少客观题小题");
  }

  return blocks.map((block, index) => parseObjectiveItem(block, index));
}

function parseObjectiveItem(block: string, index: number): ObjectiveItem {
  const body = block.replace(/^###\s+第\s*\d+\s*题\s*/m, "").trim();
  const answerMatch = body.match(/^答案[:：]\s*([A-Za-z])\s*$/m);
  const scoreMatch = body.match(/^分值[:：]\s*(\d+)\s*$/m);
  if (!answerMatch) {
    throw new ProblemMarkdownError(`第 ${index + 1} 小题缺少答案`);
  }
  if (!scoreMatch) {
    throw new ProblemMarkdownError(`第 ${index + 1} 小题缺少分值`);
  }

  const content = body
    .replace(/^答案[:：].*$/m, "")
    .replace(/^分值[:：].*$/m, "")
    .trim();
  const options: ObjectiveItem["options"] = [];
  let firstOptionIndex = -1;
  let offset = 0;
  let inFence = false;

  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      offset += line.length + 1;
      continue;
    }

    if (!inFence) {
      const emptyOptionMatch = line.match(/^([A-Da-d])[\.\、][ \t]*$/);
      if (emptyOptionMatch) {
        throw new ProblemMarkdownError(
          `第 ${index + 1} 小题选项 ${emptyOptionMatch[1].toUpperCase()} 缺少内容，选项必须写成“${emptyOptionMatch[1].toUpperCase()}. 选项内容”`,
        );
      }

      const optionMatch = line.match(/^([A-Da-d])[\.\、][ \t]*(.+)$/);
      if (optionMatch) {
        if (firstOptionIndex < 0) firstOptionIndex = offset;
        options.push({
          label: optionMatch[1].toUpperCase(),
          text: optionMatch[2].trim(),
        });
      }
    }

    offset += line.length + 1;
  }

  if (inFence) {
    throw new ProblemMarkdownError(`第 ${index + 1} 小题代码块未闭合`);
  }

  const stem =
    firstOptionIndex >= 0 ? content.slice(0, firstOptionIndex).trim() : content;
  const isJudge =
    options.length === 2 &&
    options.some((option) => option.text.includes("正确")) &&
    options.some((option) => option.text.includes("错误"));

  const item: ObjectiveItem = {
    kind: isJudge ? "judge" : "choice",
    stem,
    options,
    answer: answerMatch[1].toUpperCase(),
    score: Number(scoreMatch[1]),
  };
  const errors = validateObjectiveItems([item]);
  if (errors.length > 0) {
    throw new ProblemMarkdownError(errors[0]);
  }
  return item;
}

function splitProblemBlocks(markdown: string) {
  const normalized = normalizeMarkdown(markdown);
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    }

    if (!inFence && /^#\s+\S/.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join("\n").trim());
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.filter(Boolean);
}

function formatProblemPrefix(index: number, title?: string) {
  return `第 ${index + 1} 题${title ? `《${title}》` : ""}`;
}

function parseSingleProblemBlock(
  markdown: string,
  options: ParseProblemsOptions,
): ParsedProblemMarkdown {
  const normalized = normalizeMarkdown(markdown);
  const titleMatch = normalized.match(/^#\s+(.+?)\s*$/m);
  const title = titleMatch?.[1]?.trim();

  if (!title) {
    throw new ProblemMarkdownError("缺少试题名称");
  }

  const difficulty =
    cleanText(getOptionalSection(normalized, "难度")) ??
    cleanText(options.defaultDifficulty);
  if (!difficulty) {
    throw new ProblemMarkdownError("缺少难度");
  }

  const category =
    cleanText(getOptionalSection(normalized, "分类")) ??
    cleanText(options.defaultCategory);
  if (!category) {
    throw new ProblemMarkdownError("缺少分类");
  }

  const declaredProblemType = cleanText(getOptionalSection(normalized, "题型"));
  const problemType = declaredProblemType
    ? normalizeProblemTypeLabel(declaredProblemType)
    : getOptionalSection(normalized, "客观题")
      ? "objective"
      : "programming";

  const description = getRequiredSection(
    normalized,
    "题目描述",
    "缺少题目描述",
  );

  if (problemType === "objective") {
    const objectiveSection = getRequiredSection(
      normalized,
      "客观题",
      "缺少客观题",
    );
    const objectiveItems = parseObjectiveItems(objectiveSection);
    const dataRange =
      cleanText(getOptionalSection(normalized, "数据范围")) ?? "选择判断题";

    return {
      title,
      problemType,
      difficulty,
      category,
      description,
      inputDescription: "每行填写一题答案，例如 A",
      outputDescription: "系统按每行答案判分。",
      samples: [],
      dataRange,
      objectiveItems,
    };
  }

  const inputDescription = getRequiredSection(
    normalized,
    "输入格式",
    "缺少输入格式",
  );
  const outputDescription = getRequiredSection(
    normalized,
    "输出格式",
    "缺少输出格式",
  );
  const sampleSection = getRequiredSection(normalized, "样例", "缺少样例");
  const samples = parseSamples(sampleSection);
  const dataRange = getRequiredSection(normalized, "数据范围", "缺少数据范围");

  return {
    title,
    problemType,
    difficulty,
    category,
    description,
    inputDescription,
    outputDescription,
    samples,
    dataRange,
  };
}

export function parseProblemsMarkdown(
  markdown: string,
  options: ParseProblemsOptions = {},
): ParseProblemsResult {
  const blocks = splitProblemBlocks(markdown);
  const unclosedFenceLine = findUnclosedFenceLine(markdown);

  if (blocks.length === 0) {
    return {
      problems: [],
      errors: ["缺少试题名称"],
    };
  }

  const problems: ParsedProblemMarkdown[] = [];
  const errors: string[] = [];

  for (const [index, block] of blocks.entries()) {
    const titleMatch = normalizeMarkdown(block).match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch?.[1]?.trim();
    try {
      problems.push(parseSingleProblemBlock(block, options));
    } catch (error) {
      const message =
        error instanceof ProblemMarkdownError || error instanceof Error
          ? error.message
          : "Markdown 解析失败";
      errors.push(`${formatProblemPrefix(index, title)}${message}`);
    }
  }

  if (unclosedFenceLine !== null) {
    errors.push(
      `Markdown 存在未闭合代码块：请检查第 ${unclosedFenceLine} 行附近或之前的 \`\`\` 标记是否成对`,
    );
  }

  return { problems, errors };
}

export function parseProblemMarkdown(
  markdown: string,
  options: ParseProblemsOptions = {},
): ParsedProblemMarkdown {
  const result = parseProblemsMarkdown(markdown, options);

  if (result.errors.length > 0) {
    const firstError = result.errors[0].replace(/^第\s+\d+\s+题(?:《.*?》)?/, "");
    throw new ProblemMarkdownError(firstError);
  }

  const firstProblem = result.problems[0];
  if (!firstProblem) {
    throw new ProblemMarkdownError("缺少试题名称");
  }

  return firstProblem;
}
