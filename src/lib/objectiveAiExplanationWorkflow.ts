import {
  createAiProviderFingerprint,
  getEffectiveAiProviderConfig,
  type AiProviderRuntimeConfig,
} from "@/lib/aiProvider";
import {
  buildObjectiveExplanationPrompt,
  createObjectiveExplanationSourceHash,
  generateObjectiveAiExplanation,
  parseObjectiveExplanationCore,
  serializeObjectiveExplanationCore,
  toObjectiveAiExplanationPayload,
  type ObjectiveAiExplanationPayload,
} from "@/lib/objectiveAiExplanation";
import {
  normalizeObjectiveAnswer,
  parseObjectiveItems,
  validateObjectiveItems,
  type ObjectiveItem,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

type ExplanationCore = NonNullable<
  ReturnType<typeof parseObjectiveExplanationCore>
>;

type ObjectiveProblemSnapshot = {
  category: string;
  description: string;
  difficulty: string;
  title: string;
};

export type PreparedObjectiveExplanation = {
  aiConfig: AiProviderRuntimeConfig;
  correctAnswer: string;
  customInstruction: string;
  expectedLabels: string[];
  item: ObjectiveItem;
  itemIndex: number;
  problem: ObjectiveProblemSnapshot;
  problemId: number;
  providerFingerprint: string;
  sourceHash: string;
};

export type ObjectiveExplanationResult = {
  cached: boolean;
  completionTokens: number | null;
  payload: ObjectiveAiExplanationPayload;
  promptTokens: number | null;
  totalTokens: number | null;
};

export class ObjectiveExplanationWorkflowError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "ObjectiveExplanationWorkflowError";
  }
}

export async function prepareObjectiveExplanation({
  itemIndex,
  problemId,
}: {
  itemIndex: number;
  problemId: number;
}): Promise<PreparedObjectiveExplanation> {
  const problem = await prisma.problem.findFirst({
    where: {
      archivedAt: null,
      id: problemId,
      problemType: "objective",
    },
    select: {
      category: true,
      description: true,
      difficulty: true,
      objectiveItems: true,
      title: true,
    },
  });
  if (!problem) {
    throw new ObjectiveExplanationWorkflowError(
      "选择判断题不存在或已经下架",
      404,
    );
  }

  const items = parseObjectiveItems(problem.objectiveItems);
  if (validateObjectiveItems(items).length > 0) {
    throw new ObjectiveExplanationWorkflowError(
      "该题的选择判断数据不完整，请先修正题目",
      400,
    );
  }
  const item = items[itemIndex - 1];
  if (!item) {
    throw new ObjectiveExplanationWorkflowError("小题序号超出范围", 400);
  }

  let aiConfig: AiProviderRuntimeConfig;
  let customInstruction: string;
  try {
    [aiConfig, customInstruction] = await Promise.all([
      getEffectiveAiProviderConfig("objective"),
      getSetting("aiObjectiveExplanationPrompt"),
    ]);
  } catch {
    throw new ObjectiveExplanationWorkflowError(
      "当前 AI 服务配置无效，请先检查系统设置",
      503,
    );
  }

  const problemSnapshot = {
    category: problem.category,
    description: problem.description,
    difficulty: problem.difficulty,
    title: problem.title,
  };
  return {
    aiConfig,
    correctAnswer: normalizeObjectiveAnswer(item.answer),
    customInstruction,
    expectedLabels: item.options.map((option) => option.label),
    item,
    itemIndex,
    problem: problemSnapshot,
    problemId,
    providerFingerprint: createAiProviderFingerprint(aiConfig),
    sourceHash: createObjectiveExplanationSourceHash({
      ...problemSnapshot,
      customInstruction,
      item,
      itemIndex,
    }),
  };
}

export async function findValidObjectiveExplanation(
  prepared: PreparedObjectiveExplanation,
): Promise<ObjectiveExplanationResult | null> {
  const cached = await prisma.objectiveAiExplanation.findUnique({
    where: {
      problemId_itemIndex: {
        itemIndex: prepared.itemIndex,
        problemId: prepared.problemId,
      },
    },
  });
  if (
    !cached ||
    cached.sourceHash !== prepared.sourceHash ||
    cached.providerFingerprint !== prepared.providerFingerprint ||
    cached.correctAnswer !== prepared.correctAnswer
  ) {
    return null;
  }
  const core = parseObjectiveExplanationCore(
    cached.explanationJson,
    prepared.expectedLabels,
  );
  if (!core) return null;
  return toResult({
    cached: true,
    completionTokens: null,
    core,
    generatedAt: cached.generatedAt,
    model: cached.model,
    prepared,
    promptTokens: null,
    totalTokens: null,
  });
}

export async function generateAndStoreObjectiveExplanation({
  generatedById,
  onProviderRequest,
  prepared,
}: {
  generatedById: number;
  onProviderRequest?: () => void;
  prepared: PreparedObjectiveExplanation;
}): Promise<ObjectiveExplanationResult> {
  const prompt = buildObjectiveExplanationPrompt({
    ...prepared.problem,
    customInstruction: prepared.customInstruction,
    item: prepared.item,
    itemIndex: prepared.itemIndex,
  });
  const generated = await generateObjectiveAiExplanation({
    config: prepared.aiConfig,
    item: prepared.item,
    onProviderRequest,
    prompt,
  });
  const generatedAt = new Date();
  const saved = await prisma.objectiveAiExplanation.upsert({
    where: {
      problemId_itemIndex: {
        itemIndex: prepared.itemIndex,
        problemId: prepared.problemId,
      },
    },
    create: {
      completionTokens: generated.completionTokens,
      correctAnswer: prepared.correctAnswer,
      explanationJson: serializeObjectiveExplanationCore(generated.core),
      generatedAt,
      generatedById,
      itemIndex: prepared.itemIndex,
      model: generated.model,
      problemId: prepared.problemId,
      promptTokens: generated.promptTokens,
      providerFingerprint: prepared.providerFingerprint,
      sourceHash: prepared.sourceHash,
      totalTokens: generated.totalTokens,
    },
    update: {
      completionTokens: generated.completionTokens,
      correctAnswer: prepared.correctAnswer,
      explanationJson: serializeObjectiveExplanationCore(generated.core),
      generatedAt,
      generatedById,
      model: generated.model,
      promptTokens: generated.promptTokens,
      providerFingerprint: prepared.providerFingerprint,
      sourceHash: prepared.sourceHash,
      totalTokens: generated.totalTokens,
    },
  });
  return toResult({
    cached: false,
    completionTokens: generated.completionTokens,
    core: generated.core,
    generatedAt: saved.generatedAt,
    model: saved.model,
    prepared,
    promptTokens: generated.promptTokens,
    totalTokens: generated.totalTokens,
  });
}

function toResult({
  cached,
  completionTokens,
  core,
  generatedAt,
  model,
  prepared,
  promptTokens,
  totalTokens,
}: {
  cached: boolean;
  completionTokens: number | null;
  core: ExplanationCore;
  generatedAt: Date;
  model: string | null;
  prepared: PreparedObjectiveExplanation;
  promptTokens: number | null;
  totalTokens: number | null;
}): ObjectiveExplanationResult {
  return {
    cached,
    completionTokens,
    payload: toObjectiveAiExplanationPayload({
      core,
      correctAnswer: prepared.correctAnswer,
      generatedAt,
      itemIndex: prepared.itemIndex,
      model,
    }),
    promptTokens,
    totalTokens,
  };
}
