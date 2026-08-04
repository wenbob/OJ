import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  completeAiUsageTurn,
  createPendingAiUsageTurn,
  findExistingAiUsageTurn,
  isValidAiClientId,
} from "./aiUsageAudit";

vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn(async () => "180"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiConversation: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aiConversationTurn: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("AI usage audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.aiConversationTurn.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.aiConversationTurn.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.aiConversation.deleteMany).mockResolvedValue({ count: 0 });
  });

  it("validates opaque client ids", () => {
    expect(isValidAiClientId("conversation_123456")).toBe(true);
    expect(isValidAiClientId("short")).toBe(false);
    expect(isValidAiClientId("<script>alert(1)</script>")).toBe(false);
  });

  it("does not replay another student's request", async () => {
    vi.mocked(prisma.aiConversationTurn.findUnique).mockResolvedValueOnce({
      status: "success",
      assistantContent: "提示",
      errorMessage: null,
      conversation: {
        clientConversationId: "conversation_123456",
        studentId: 99,
      },
    } as never);

    await expect(
      findExistingAiUsageTurn({ requestId: "request_12345678", studentId: 2 }),
    ).resolves.toEqual({ kind: "forbidden" });
  });

  it("stores only the visible question and audit metadata in a pending turn", async () => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.aiConversation.create).mockResolvedValueOnce({ id: 7 } as never);
    vi.mocked(prisma.aiConversationTurn.create).mockResolvedValueOnce({ id: 8 } as never);

    await createPendingAiUsageTurn({
      clientConversationId: "conversation_123456",
      examId: null,
      examTitle: null,
      mode: "question",
      problemId: 113,
      problemTitle: "模拟题 1：体温提示",
      requestId: "request_12345678",
      scope: "practice",
      studentId: 2,
      userContent: "这道题为什么要判断三个范围？",
    });

    const data = vi.mocked(prisma.aiConversationTurn.create).mock.calls[0]?.[0]
      .data as Record<string, unknown>;
    expect(data).toEqual({
      aiProfile: "programming",
      conversationId: 7,
      mode: "question",
      objectiveItemIndex: null,
      requestId: "request_12345678",
      status: "pending",
      userContent: "这道题为什么要判断三个范围？",
    });
    expect(data).not.toHaveProperty("code");
    expect(data).not.toHaveProperty("history");
    expect(data).not.toHaveProperty("prompt");
    expect(data).not.toHaveProperty("reasoning_content");
  });

  it("stores returned model usage without estimating missing values", async () => {
    vi.mocked(prisma.aiConversationTurn.update).mockResolvedValueOnce({ id: 8 } as never);

    await completeAiUsageTurn({
      advice: "先判断输入落在哪个范围。",
      cached: false,
      completedAt: new Date("2026-07-19T03:00:05.000Z"),
      providerCallCount: 1,
      requestId: "request_12345678",
      startedAt: new Date("2026-07-19T03:00:00.000Z").getTime(),
      telemetry: {
        model: "deepseek-v4-pro",
        promptTokens: 500,
        completionTokens: null,
        totalTokens: null,
      },
    });

    expect(prisma.aiConversationTurn.update).toHaveBeenCalledWith({
      where: { requestId: "request_12345678" },
      data: expect.objectContaining({
        completionTokens: null,
        latencyMs: 5000,
        model: "deepseek-v4-pro",
        promptTokens: 500,
        providerCallCount: 1,
        status: "success",
        totalTokens: null,
      }),
    });
  });
});
