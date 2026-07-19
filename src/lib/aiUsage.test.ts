import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildAiUsageDateRange, getAiUsageDashboard, readAiUsageFilters } from "./aiUsage";

vi.mock("@/lib/aiUsageAudit", () => ({
  runAiUsageMaintenance: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    aiConversationTurn: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("AI usage analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Asia/Shanghai boundaries for today and custom ranges", () => {
    const today = readAiUsageFilters(new URLSearchParams("window=today"));
    expect(
      buildAiUsageDateRange(today, new Date("2026-07-19T03:00:00.000Z")),
    ).toEqual({
      gte: new Date("2026-07-18T16:00:00.000Z"),
      lt: new Date("2026-07-19T03:00:00.000Z"),
    });

    const custom = readAiUsageFilters(
      new URLSearchParams("window=custom&start=2026-07-01&end=2026-07-02"),
    );
    expect(buildAiUsageDateRange(custom)).toEqual({
      gte: new Date("2026-06-30T16:00:00.000Z"),
      lt: new Date("2026-07-02T16:00:00.000Z"),
    });
  });

  it("separates student usage, provider calls, cache hits, failures, and tokens", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 1, username: "a", studentProfile: { aiAccessEnabled: true } },
      { id: 2, username: "b", studentProfile: null },
    ] as never);
    vi.mocked(prisma.aiConversationTurn.findMany)
      .mockResolvedValueOnce([
        { status: "success", providerCallCount: 1, totalTokens: 120, createdAt: new Date("2026-07-19T01:00:00Z"), conversation: { studentId: 1 } },
        { status: "cached", providerCallCount: 0, totalTokens: null, createdAt: new Date("2026-07-19T01:10:00Z"), conversation: { studentId: 1 } },
        { status: "failed", providerCallCount: 2, totalTokens: 40, createdAt: new Date("2026-07-19T02:00:00Z"), conversation: { studentId: 2 } },
      ] as never)
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-07-19T01:00:00Z") },
        { createdAt: new Date("2026-07-19T01:10:00Z") },
      ] as never);

    const result = await getAiUsageDashboard(
      readAiUsageFilters(new URLSearchParams("window=today")),
      new Date("2026-07-19T04:00:00Z"),
    );

    expect(result.summary).toMatchObject({
      usageCount: 3,
      providerCallCount: 3,
      cachedCount: 1,
      failedCount: 1,
      totalTokens: 160,
      successRate: 67,
    });
    expect(result.activeStudentCount).toBe(2);
    expect(result.rows[0]).toMatchObject({
      student: { username: "a", aiAccessEnabled: true },
      usageCount: 2,
    });
    expect(result.hourly[9].count).toBe(2);
  });
});
