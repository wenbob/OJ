import {
  normalizeObjectiveItems,
  normalizeProblemType,
  stringifyObjectiveItems,
  validateObjectiveItems,
  type ObjectiveItem,
  type ProblemType,
} from "./objectiveProblem";
import { assertJudgeCasePayload } from "./judgeCaseLimits";

export type ProblemPayload = {
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  sampleInput: string;
  sampleOutput: string;
  dataRange?: string;
  difficulty: string;
  category: string;
  problemType: ProblemType;
  objectiveItems?: string;
  testCases: {
    input: string;
    output: string;
    isSample: boolean;
  }[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rawText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readObjectiveItems(value: unknown): ObjectiveItem[] {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? normalizeObjectiveItems(parsed) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? normalizeObjectiveItems(value) : [];
}

export function normalizeProblemPayload(body: unknown): ProblemPayload {
  const data = typeof body === "object" && body ? dataRecord(body) : {};
  const problemType = normalizeProblemType(data.problemType);
  const title = text(data.title);
  const description = text(data.description);
  const difficulty = text(data.difficulty) || "入门";
  const category = text(data.category) || "未分类";
  const dataRange = text(data.dataRange);

  if (!title) throw new Error("标题不能为空");
  if (!description) throw new Error("题目描述不能为空");
  if (!difficulty) throw new Error("难度不能为空");
  if (!category) throw new Error("分类不能为空");

  if (problemType === "objective") {
    const objectiveItems = readObjectiveItems(data.objectiveItems);
    const errors = validateObjectiveItems(objectiveItems);
    if (errors.length > 0) throw new Error(errors[0]);

    return {
      title,
      description,
      inputDescription: "每行填写一题答案，例如 A",
      outputDescription: "系统按每行答案判分。",
      sampleInput: "",
      sampleOutput: "",
      dataRange: dataRange || "选择判断题",
      difficulty,
      category,
      problemType,
      objectiveItems: stringifyObjectiveItems(objectiveItems),
      testCases: [],
    };
  }

  const inputDescription = text(data.inputDescription);
  const outputDescription = text(data.outputDescription);
  const incomingCases = Array.isArray(data.testCases) ? data.testCases : [];
  const testCases = incomingCases
    .map((item) => {
      const record = typeof item === "object" && item ? dataRecord(item) : {};
      return {
        input: rawText(record.input),
        output: rawText(record.output),
        isSample: Boolean(record.isSample),
      };
    })
    .filter((item) => item.input.trim() || item.output.trim());

  const sampleCase = testCases.find((item) => item.isSample) ?? testCases[0];
  const sampleInput = rawText(data.sampleInput) || sampleCase?.input || "";
  const sampleOutput = rawText(data.sampleOutput) || sampleCase?.output || "";

  if (!inputDescription) throw new Error("输入格式不能为空");
  if (!outputDescription) throw new Error("输出格式不能为空");
  if (!sampleInput.trim()) throw new Error("样例输入不能为空");
  if (!sampleOutput.trim()) throw new Error("样例输出不能为空");

  if (testCases.length === 0) {
    testCases.push({
      input: sampleInput,
      output: sampleOutput,
      isSample: true,
    });
  }

  assertJudgeCasePayload(testCases);

  for (const testCase of testCases) {
    if (!testCase.input.trim() || !testCase.output.trim()) {
      throw new Error("测试点输入和输出不能为空");
    }
  }

  const sampleCount = testCases.filter((testCase) => testCase.isSample).length;
  if (sampleCount < 2) {
    throw new Error("题目至少需要两组样例");
  }

  return {
    title,
    description,
    inputDescription,
    outputDescription,
    sampleInput,
    sampleOutput,
    dataRange,
    difficulty,
    category,
    problemType,
    testCases,
  };
}

function dataRecord(value: unknown) {
  return value as Record<string, unknown>;
}
