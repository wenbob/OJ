import type { Prisma } from "@prisma/client";
import type { ParsedProblemMarkdown } from "./markdownParser";
import { getJudgeCasePayloadError } from "./judgeCaseLimits";
import {
  isProblemType,
  stringifyObjectiveItems,
  validateObjectiveItems,
} from "./objectiveProblem";

type ProblemDefaults = {
  defaultCategory?: string;
  defaultDifficulty?: string;
};

function cleanText(value?: string) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

export function applyProblemDefaults(
  problems: ParsedProblemMarkdown[],
  defaults: ProblemDefaults = {},
) {
  return problems.map((problem) => ({
    ...problem,
    difficulty:
      cleanText(problem.difficulty) ?? cleanText(defaults.defaultDifficulty) ?? "",
    category:
      cleanText(problem.category) ?? cleanText(defaults.defaultCategory) ?? "",
  }));
}

export function validateParsedProblems(
  problems: ParsedProblemMarkdown[],
  defaults: ProblemDefaults = {},
) {
  const errors: string[] = [];
  const normalizedProblems = applyProblemDefaults(problems, defaults);

  if (normalizedProblems.length === 0) {
    return ["没有可导入的题目"];
  }

  normalizedProblems.forEach((problem, index) => {
    const title = problem.title?.trim();
    const prefix = `第 ${index + 1} 题${title ? `《${title}》` : ""}`;

    if (!title) errors.push(`${prefix}缺少试题名称`);
    if (!problem.difficulty?.trim()) errors.push(`${prefix}缺少难度`);
    if (!problem.category?.trim()) errors.push(`${prefix}缺少分类`);
    if (!problem.description?.trim()) errors.push(`${prefix}缺少题目描述`);
    if (!problem.dataRange?.trim()) errors.push(`${prefix}缺少数据范围`);
    if (!isProblemType(problem.problemType)) {
      errors.push(`${prefix}题型不合法`);
      return;
    }

    if (problem.problemType === "objective") {
      validateObjectiveItems(problem.objectiveItems ?? []).forEach((error) => {
        errors.push(`${prefix}${error}`);
      });
      return;
    }

    if (!problem.inputDescription?.trim()) errors.push(`${prefix}缺少输入格式`);
    if (!problem.outputDescription?.trim()) errors.push(`${prefix}缺少输出格式`);

    if (!Array.isArray(problem.samples) || problem.samples.length === 0) {
      errors.push(`${prefix}缺少样例`);
      return;
    }

    if (problem.samples.length < 2) {
      errors.push(
        `${prefix}至少需要两组样例，当前只有 ${problem.samples.length} 组`,
      );
    }

    const casePayloadError = getJudgeCasePayloadError(problem.samples);
    if (casePayloadError) errors.push(`${prefix}${casePayloadError}`);

    problem.samples.forEach((sample, sampleIndex) => {
      if (!sample.input?.trim() || !sample.output?.trim()) {
        errors.push(`${prefix}第 ${sampleIndex + 1} 组样例代码块内容为空`);
      }
    });
  });

  return errors;
}

export async function createImportedProblems(
  tx: Prisma.TransactionClient,
  problems: ParsedProblemMarkdown[],
  defaults: ProblemDefaults = {},
) {
  const ids: number[] = [];
  const normalizedProblems = applyProblemDefaults(problems, defaults);
  const countsByType = new Map<string, number>();
  for (const problem of normalizedProblems) {
    countsByType.set(
      problem.problemType,
      (countsByType.get(problem.problemType) ?? 0) + 1,
    );
  }
  const baseSortOrderByType = new Map<string, number>();
  for (const problemType of countsByType.keys()) {
    const aggregate = await tx.problem.aggregate({
      where: { problemType },
      _max: { sortOrder: true },
    });
    baseSortOrderByType.set(problemType, aggregate._max.sortOrder ?? 0);
  }
  const seenByType = new Map<string, number>();

  for (const problem of normalizedProblems) {
    const firstSample = problem.samples[0];
    const seen = seenByType.get(problem.problemType) ?? 0;
    const sortOrder =
      (baseSortOrderByType.get(problem.problemType) ?? 0) +
      (countsByType.get(problem.problemType) ?? 0) -
      seen;
    seenByType.set(problem.problemType, seen + 1);
    const created = await tx.problem.create({
      data: {
        title: problem.title,
        description: problem.description,
        inputDescription: problem.inputDescription,
        outputDescription: problem.outputDescription,
        sampleInput: firstSample?.input ?? "",
        sampleOutput: firstSample?.output ?? "",
        dataRange: problem.dataRange,
        difficulty: problem.difficulty,
        category: problem.category,
        problemType: problem.problemType,
        sortOrder,
        objectiveItems:
          problem.problemType === "objective"
            ? stringifyObjectiveItems(problem.objectiveItems ?? [])
            : undefined,
        testCases:
          problem.problemType === "programming"
            ? {
                create: problem.samples.map((sample) => ({
                  input: sample.input,
                  output: sample.output,
                  isSample: true,
                })),
              }
            : undefined,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }

  return ids;
}
