import { randomUUID } from "node:crypto";
import type { AiAssistMode, AiAssistProviderTelemetry } from "@/lib/aiAssist";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const INTERRUPTED_AFTER_MS = 10 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type AiUsageMode = AiAssistMode | "objective_explanation";
export type AiUsageProfile = "programming" | "objective";
export type AiUsageScope = "practice" | "exam";

export type AiUsageReplayContext = {
  aiProfile: AiUsageProfile;
  examId: number | null;
  mode: AiUsageMode;
  objectiveItemIndex?: number | null;
  problemId: number;
  scope: AiUsageScope;
};

let lastMaintenanceAt = 0;

export type AiUsageExecution = {
  advice: string;
  providerCallCount: number;
  telemetry: AiAssistProviderTelemetry;
};

export type ExistingAiUsageTurn =
  | { kind: "none" }
  | { kind: "forbidden" }
  | { kind: "conflict" }
  | { kind: "pending"; conversationId: string; requestId: string }
  | {
      kind: "completed";
      conversationId: string;
      requestId: string;
      advice: string;
      cached: boolean;
    }
  | {
      kind: "failed";
      conversationId: string;
      requestId: string;
      error: string;
    };

export function normalizeAiClientId(value: unknown) {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value)
    ? value
    : randomUUID();
}

export function isValidAiClientId(value: unknown) {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}

export async function findExistingAiUsageTurn({
  aiProfile,
  examId,
  mode,
  objectiveItemIndex = null,
  problemId,
  requestId,
  scope,
  studentId,
}: AiUsageReplayContext & {
  requestId: string;
  studentId: number;
}): Promise<ExistingAiUsageTurn> {
  const turn = await prisma.aiConversationTurn.findUnique({
    where: { requestId },
    include: {
      conversation: {
        select: {
          clientConversationId: true,
          examId: true,
          problemId: true,
          scope: true,
          studentId: true,
        },
      },
    },
  });
  if (!turn) return { kind: "none" };
  if (turn.conversation.studentId !== studentId) return { kind: "forbidden" };
  if (
    turn.aiProfile !== aiProfile ||
    turn.conversation.examId !== examId ||
    turn.mode !== mode ||
    turn.objectiveItemIndex !== objectiveItemIndex ||
    turn.conversation.problemId !== problemId ||
    turn.conversation.scope !== scope
  ) {
    return { kind: "conflict" };
  }

  const base = {
    conversationId: turn.conversation.clientConversationId,
    requestId,
  };
  if (turn.status === "pending") return { kind: "pending", ...base };
  if (
    (turn.status === "success" || turn.status === "cached") &&
    turn.assistantContent
  ) {
    return {
      kind: "completed",
      ...base,
      advice: turn.assistantContent,
      cached: turn.status === "cached",
    };
  }
  return {
    kind: "failed",
    ...base,
    error: turn.errorMessage || "AI 服务异常，请稍后再试。",
  };
}

export async function createPendingAiUsageTurn({
  aiProfile = "programming",
  clientConversationId,
  examId,
  examTitle,
  mode,
  objectiveItemIndex = null,
  problemId,
  problemTitle,
  requestId,
  scope,
  studentId,
  userContent,
}: {
  aiProfile?: AiUsageProfile;
  clientConversationId: string;
  examId: number | null;
  examTitle: string | null;
  mode: AiUsageMode;
  objectiveItemIndex?: number | null;
  problemId: number;
  problemTitle: string;
  requestId: string;
  scope: AiUsageScope;
  studentId: number;
  userContent: string;
}) {
  await runAiUsageMaintenance();

  const existingConversation = await prisma.aiConversation.findUnique({
    where: { clientConversationId },
  });
  if (
    existingConversation &&
    (existingConversation.studentId !== studentId ||
      existingConversation.problemId !== problemId ||
      existingConversation.examId !== examId ||
      existingConversation.scope !== scope)
  ) {
    throw new AiUsageAuditError("AI 对话标识与当前题目不匹配", "forbidden");
  }

  const now = new Date();
  const conversation = existingConversation
    ? await prisma.aiConversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: now },
      })
    : await prisma.aiConversation.create({
        data: {
          clientConversationId,
          examId,
          examTitle,
          lastMessageAt: now,
          problemId,
          problemTitle,
          scope,
          startedAt: now,
          studentId,
        },
      });

  return prisma.aiConversationTurn.create({
    data: {
      conversationId: conversation.id,
      mode,
      aiProfile,
      objectiveItemIndex,
      requestId,
      status: "pending",
      userContent,
    },
  });
}

export async function completeAiUsageTurn({
  advice,
  cached,
  completedAt,
  providerCallCount,
  requestId,
  startedAt,
  telemetry,
}: {
  advice: string;
  cached: boolean;
  completedAt: Date;
  providerCallCount: number;
  requestId: string;
  startedAt: number;
  telemetry: AiAssistProviderTelemetry;
}) {
  await prisma.aiConversationTurn.update({
    where: { requestId },
    data: {
      assistantContent: advice,
      completedAt,
      completionTokens: telemetry.completionTokens,
      latencyMs: Math.max(0, completedAt.getTime() - startedAt),
      model: telemetry.model,
      promptTokens: telemetry.promptTokens,
      providerCallCount,
      status: cached ? "cached" : "success",
      totalTokens: telemetry.totalTokens,
    },
  });
}

export async function failAiUsageTurn({
  completedAt,
  errorMessage,
  providerCallCount,
  requestId,
  startedAt,
  telemetry,
}: {
  completedAt: Date;
  errorMessage: string;
  providerCallCount: number;
  requestId: string;
  startedAt: number;
  telemetry: AiAssistProviderTelemetry;
}) {
  await prisma.aiConversationTurn.update({
    where: { requestId },
    data: {
      completedAt,
      completionTokens: telemetry.completionTokens,
      errorMessage,
      latencyMs: Math.max(0, completedAt.getTime() - startedAt),
      model: telemetry.model,
      promptTokens: telemetry.promptTokens,
      providerCallCount,
      status: "failed",
      totalTokens: telemetry.totalTokens,
    },
  });
}

export class AiUsageAuditError extends Error {
  constructor(
    message: string,
    readonly reason: "forbidden" | "storage",
  ) {
    super(message);
  }
}

export const emptyAiProviderTelemetry: AiAssistProviderTelemetry = {
  model: null,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

export function mergeAiProviderTelemetry(
  current: AiAssistProviderTelemetry,
  next: AiAssistProviderTelemetry,
): AiAssistProviderTelemetry {
  return {
    model: next.model || current.model,
    promptTokens: addOptionalCounts(current.promptTokens, next.promptTokens),
    completionTokens: addOptionalCounts(
      current.completionTokens,
      next.completionTokens,
    ),
    totalTokens: addOptionalCounts(current.totalTokens, next.totalTokens),
  };
}

export async function runAiUsageMaintenance() {
  const now = Date.now();
  if (now - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
  lastMaintenanceAt = now;

  try {
    await prisma.aiConversationTurn.updateMany({
      where: {
        status: "pending",
        createdAt: { lt: new Date(now - INTERRUPTED_AFTER_MS) },
      },
      data: {
        status: "interrupted",
        completedAt: new Date(now),
        errorMessage: "AI 请求中断，未取得最终回复。",
      },
    });

    const retentionDays = Number(await getSetting("aiConversationRetentionDays"));
    if (Number.isInteger(retentionDays) && retentionDays > 0) {
      const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
      await prisma.aiConversationTurn.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      await prisma.aiConversation.deleteMany({
        where: { turns: { none: {} } },
      });
    }
  } catch {
    // Maintenance is best-effort; creating the actual audit row remains mandatory.
  }
}

function addOptionalCounts(left: number | null, right: number | null) {
  if (left === null && right === null) return null;
  return (left || 0) + (right || 0);
}
