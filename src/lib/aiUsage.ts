import type { Prisma } from "@prisma/client";
import { runAiUsageMaintenance } from "@/lib/aiUsageAudit";
import { buildPaginationMeta } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export const AI_USAGE_WINDOWS = ["today", "7d", "30d", "all", "custom"] as const;
export const AI_USAGE_MODES = ["overview", "next_step", "code_review", "question"] as const;
export const AI_USAGE_STATUSES = ["pending", "success", "cached", "failed", "interrupted"] as const;
export const AI_USAGE_SCOPES = ["practice", "exam"] as const;

export type AiUsageWindow = (typeof AI_USAGE_WINDOWS)[number];
export type AiUsageFilters = {
  window: AiUsageWindow;
  startDate: string;
  endDate: string;
  studentId: number | null;
  query: string;
  mode: string;
  scope: string;
  status: string;
};

export const aiUsageModeLabels: Record<string, string> = {
  overview: "理解题目",
  next_step: "下一步提示",
  code_review: "检查当前代码",
  question: "自由提问",
};

export const aiUsageStatusLabels: Record<string, string> = {
  pending: "处理中",
  success: "成功",
  cached: "缓存命中",
  failed: "失败",
  interrupted: "请求中断",
};

export function readAiUsageFilters(searchParams: URLSearchParams): AiUsageFilters {
  const rawWindow = searchParams.get("window");
  const window: AiUsageWindow = AI_USAGE_WINDOWS.includes(rawWindow as AiUsageWindow)
    ? (rawWindow as AiUsageWindow)
    : "today";
  const studentId = Number(searchParams.get("studentId"));
  return {
    window,
    startDate: readDateInput(searchParams.get("start")),
    endDate: readDateInput(searchParams.get("end")),
    studentId: Number.isInteger(studentId) && studentId > 0 ? studentId : null,
    query: (searchParams.get("q") || "").trim().slice(0, 100),
    mode: readEnum(searchParams.get("mode"), AI_USAGE_MODES),
    scope: readEnum(searchParams.get("scope"), AI_USAGE_SCOPES),
    status: readEnum(searchParams.get("status"), AI_USAGE_STATUSES),
  };
}

export function buildAiUsageDateRange(filters: AiUsageFilters, now = new Date()) {
  const endNow = now;
  if (filters.window === "all") return { gte: undefined, lt: undefined };
  if (filters.window === "custom") {
    const start = parseShanghaiDate(filters.startDate);
    const end = parseShanghaiDate(filters.endDate);
    return {
      gte: start || undefined,
      lt: end ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : undefined,
    };
  }
  const todayStart = startOfShanghaiDay(now);
  const days = filters.window === "7d" ? 7 : filters.window === "30d" ? 30 : 1;
  return {
    gte: new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
    lt: endNow,
  };
}

export async function getAiUsageDashboard(
  filters: AiUsageFilters,
  now = new Date(),
) {
  await runAiUsageMaintenance();
  const where = buildTurnWhere(filters, now);
  const studentWhere: Prisma.UserWhereInput = {
    role: "student",
    ...(filters.studentId ? { id: filters.studentId } : {}),
    ...(filters.query ? { username: { contains: filters.query } } : {}),
  };
  const [students, turns, todayTurns] = await Promise.all([
    prisma.user.findMany({
      where: studentWhere,
      orderBy: [{ username: "asc" }, { id: "asc" }],
      select: {
        id: true,
        username: true,
        studentProfile: { select: { aiAccessEnabled: true } },
      },
    }),
    prisma.aiConversationTurn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        providerCallCount: true,
        totalTokens: true,
        createdAt: true,
        conversation: { select: { studentId: true } },
      },
    }),
    prisma.aiConversationTurn.findMany({
      where: buildTurnWhere(filters, now, {
        gte: startOfShanghaiDay(now),
        lt: now,
      }),
      select: { createdAt: true },
    }),
  ]);

  const turnsByStudent = new Map<number, typeof turns>();
  for (const turn of turns) {
    const items = turnsByStudent.get(turn.conversation.studentId) || [];
    items.push(turn);
    turnsByStudent.set(turn.conversation.studentId, items);
  }

  const rows = students.map((student) => {
    const studentTurns = turnsByStudent.get(student.id) || [];
    return {
      student: {
        id: student.id,
        username: student.username,
        aiAccessEnabled: Boolean(student.studentProfile?.aiAccessEnabled),
      },
      ...summarizeTurns(studentTurns),
    };
  });
  rows.sort(
    (a, b) =>
      b.usageCount - a.usageCount ||
      (b.lastUsedAt?.getTime() || 0) - (a.lastUsedAt?.getTime() || 0) ||
      a.student.username.localeCompare(b.student.username, "zh-CN") ||
      a.student.id - b.student.id,
  );

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const turn of todayTurns) {
    const hour = new Date(turn.createdAt.getTime() + SHANGHAI_OFFSET_MS).getUTCHours();
    hourly[hour].count += 1;
  }

  return {
    filters,
    summary: summarizeTurns(turns),
    activeStudentCount: new Set(
      turns.map((turn) => turn.conversation.studentId),
    ).size,
    hourly,
    rows,
  };
}

export async function getAiUsageStudentDetail({
  filters,
  page,
  pageSize,
  studentId,
  now = new Date(),
}: {
  filters: AiUsageFilters;
  page: number;
  pageSize: number;
  studentId: number;
  now?: Date;
}) {
  await runAiUsageMaintenance();
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student" },
    select: {
      id: true,
      username: true,
      studentProfile: { select: { aiAccessEnabled: true } },
    },
  });
  if (!student) return null;

  const where = buildTurnWhere({ ...filters, studentId }, now);
  const [summaryTurns, items, total] = await Promise.all([
    prisma.aiConversationTurn.findMany({
      where,
      select: {
        status: true,
        providerCallCount: true,
        totalTokens: true,
        createdAt: true,
      },
    }),
    prisma.aiConversationTurn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        requestId: true,
        mode: true,
        userContent: true,
        assistantContent: true,
        status: true,
        errorMessage: true,
        latencyMs: true,
        providerCallCount: true,
        model: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        createdAt: true,
        completedAt: true,
        conversation: {
          select: {
            id: true,
            clientConversationId: true,
            scope: true,
            problemId: true,
            problemTitle: true,
            examId: true,
            examTitle: true,
          },
        },
      },
    }),
    prisma.aiConversationTurn.count({ where }),
  ]);

  return {
    student: {
      id: student.id,
      username: student.username,
      aiAccessEnabled: Boolean(student.studentProfile?.aiAccessEnabled),
    },
    summary: summarizeTurns(summaryTurns),
    items,
    ...buildPaginationMeta({ page, pageSize, total }),
  };
}

function buildTurnWhere(
  filters: AiUsageFilters,
  now: Date,
  rangeOverride?: { gte?: Date; lt?: Date },
): Prisma.AiConversationTurnWhereInput {
  const range = rangeOverride || buildAiUsageDateRange(filters, now);
  return {
    ...(range.gte || range.lt
      ? {
          createdAt: {
            ...(range.gte ? { gte: range.gte } : {}),
            ...(range.lt ? { lt: range.lt } : {}),
          },
        }
      : {}),
    ...(filters.mode ? { mode: filters.mode } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    conversation: {
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.scope ? { scope: filters.scope } : {}),
      student: {
        role: "student",
        ...(filters.query ? { username: { contains: filters.query } } : {}),
      },
    },
  };
}

function summarizeTurns<T extends {
  status: string;
  providerCallCount: number;
  totalTokens: number | null;
  createdAt: Date;
}>(turns: T[]) {
  let successCount = 0;
  let cachedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let providerCallCount = 0;
  let totalTokens = 0;
  let hasTokenData = false;
  let lastUsedAt: Date | null = null;

  for (const turn of turns) {
    if (turn.status === "success") successCount += 1;
    else if (turn.status === "cached") cachedCount += 1;
    else if (turn.status === "pending") pendingCount += 1;
    else failedCount += 1;
    providerCallCount += turn.providerCallCount;
    if (turn.totalTokens !== null) {
      totalTokens += turn.totalTokens;
      hasTokenData = true;
    }
    if (!lastUsedAt || turn.createdAt > lastUsedAt) lastUsedAt = turn.createdAt;
  }

  const finalized = successCount + cachedCount + failedCount;
  return {
    usageCount: turns.length,
    successCount,
    cachedCount,
    failedCount,
    pendingCount,
    providerCallCount,
    totalTokens: hasTokenData ? totalTokens : null,
    successRate:
      finalized > 0 ? Math.round(((successCount + cachedCount) / finalized) * 100) : 0,
    lastUsedAt,
  };
}

function startOfShanghaiDay(value: Date) {
  const shifted = new Date(value.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - SHANGHAI_OFFSET_MS,
  );
}

function parseShanghaiDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS);
  const shifted = new Date(utc.getTime() + SHANGHAI_OFFSET_MS);
  return shifted.getUTCFullYear() === year &&
    shifted.getUTCMonth() === month - 1 &&
    shifted.getUTCDate() === day
    ? utc
    : null;
}

function readDateInput(value: string | null) {
  return value && parseShanghaiDate(value) ? value : "";
}

function readEnum<const T extends readonly string[]>(
  value: string | null,
  allowed: T,
) {
  return value && allowed.includes(value) ? value : "";
}
