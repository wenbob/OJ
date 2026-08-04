import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import {
  createAiProviderFingerprint,
  type AiProviderRuntimeConfig,
} from "@/lib/aiProvider";
import {
  completeAiUsageTurn,
  createPendingAiUsageTurn,
  findExistingAiUsageTurn,
} from "@/lib/aiUsageAudit";
import {
  createObjectiveExplanationSourceHash,
  generateObjectiveAiExplanation,
  serializeObjectiveExplanationCore,
} from "@/lib/objectiveAiExplanation";
import { clearObjectiveAiExplanationRateLimits } from "@/lib/objectiveAiExplanationRateLimit";
import { parseObjectiveItems } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { defaultSystemSettings, getSetting } from "@/lib/settings";
import { POST } from "./route";

const providerConfig: AiProviderRuntimeConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
  customThinkingProtocol: "none",
  legacyFallback: false,
  model: "objective-model",
  provider: "deepseek",
  thinkingMode: "disabled",
};

const problem = {
  category: "基础知识",
  description: "请选择正确答案。",
  difficulty: "入门",
  objectiveItems: JSON.stringify([
    {
      answer: "B",
      kind: "choice",
      options: [
        { label: "A", text: "处理器" },
        { label: "B", text: "存储器" },
      ],
      score: 2,
      stem: "哪个部件负责保存数据？",
    },
  ]),
  title: "计算机组成",
};

const core = {
  overview: "先判断各部件职责。",
  options: [
    { label: "A", explanation: "处理器负责运算。" },
    { label: "B", explanation: "存储器负责保存数据。" },
  ],
  takeaway: "存储器用于保存数据。",
};

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    response: null,
    user: { id: 8, role: "student", username: "alice" },
  })),
}));

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>(
    "@/lib/settings",
  );
  return {
    ...actual,
    getSetting: vi.fn(async (key: string) =>
      key === "aiObjectiveStudentCooldownSeconds" ? "17" : "true",
    ),
  };
});

vi.mock("@/lib/aiProvider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiProvider")>(
    "@/lib/aiProvider",
  );
  return {
    ...actual,
    getEffectiveAiProviderConfig: vi.fn(async () => providerConfig),
  };
});

vi.mock("@/lib/objectiveAiExplanation", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/objectiveAiExplanation")>(
      "@/lib/objectiveAiExplanation",
    );
  return {
    ...actual,
    generateObjectiveAiExplanation: vi.fn(
      async (input: { onProviderRequest?: () => void }) => {
        input.onProviderRequest?.();
        return {
          completionTokens: 12,
          core,
          model: "objective-model",
          promptTokens: 24,
          totalTokens: 36,
        };
      },
    ),
  };
});

vi.mock("@/lib/aiUsageAudit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiUsageAudit")>(
    "@/lib/aiUsageAudit",
  );
  return {
    ...actual,
    completeAiUsageTurn: vi.fn(async () => ({})),
    createPendingAiUsageTurn: vi.fn(async () => ({ id: 1 })),
    failAiUsageTurn: vi.fn(async () => ({})),
    findExistingAiUsageTurn: vi.fn(async () => ({ kind: "none" })),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    examRecord: { findFirst: vi.fn() },
    objectiveAiExplanation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    problem: { findFirst: vi.fn() },
    studentProfile: { findUnique: vi.fn() },
    submission: { findFirst: vi.fn() },
  },
}));

function request(body: unknown) {
  return new Request(
    "http://oj.local/api/problems/10/objective-explanation",
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

function context() {
  return { params: Promise.resolve({ id: "10" }) };
}

describe("POST /api/problems/:id/objective-explanation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearObjectiveAiExplanationRateLimits();
    vi.mocked(requireApiUser).mockResolvedValue({
      response: null,
      user: { id: 8, role: "student", username: "alice" },
    });
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "aiObjectiveStudentCooldownSeconds") return "17";
      if (key === "aiObjectiveExplanationPrompt") {
        return defaultSystemSettings.aiObjectiveExplanationPrompt;
      }
      return "true";
    });
    vi.mocked(prisma.studentProfile.findUnique).mockResolvedValue({
      objectiveAiAccessEnabled: true,
    } as never);
    vi.mocked(prisma.submission.findFirst).mockResolvedValue({ id: 91 } as never);
    vi.mocked(prisma.examRecord.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.problem.findFirst).mockResolvedValue(problem as never);
    vi.mocked(prisma.objectiveAiExplanation.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.objectiveAiExplanation.upsert).mockResolvedValue({
      generatedAt: new Date("2026-08-04T04:00:00.000Z"),
      model: "objective-model",
    } as never);
    vi.mocked(findExistingAiUsageTurn).mockResolvedValue({ kind: "none" });
  });

  it("unlocks after a daily attempt and audits only the selected item", async () => {
    const response = await POST(
      request({
        conversationId: "conversation_123456",
        force: false,
        itemIndex: 1,
        requestId: "request_12345678",
      }) as never,
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.explanation.correctAnswer).toBe("B");
    expect(body.cooldownSeconds).toBe(17);
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ submissionType: "practice" }),
      }),
    );
    expect(createPendingAiUsageTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        aiProfile: "objective",
        mode: "objective_explanation",
        objectiveItemIndex: 1,
        studentId: 8,
      }),
    );
    expect(completeAiUsageTurn).toHaveBeenCalledWith(
      expect.objectContaining({ cached: false, providerCallCount: 1 }),
    );
  });

  it("rejects students without a daily attempt", async () => {
    vi.mocked(prisma.submission.findFirst).mockResolvedValueOnce(null);
    const response = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("OBJECTIVE_ATTEMPT_REQUIRED");
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects use while an exam containing the problem is in progress", async () => {
    vi.mocked(prisma.examRecord.findFirst).mockResolvedValueOnce({ id: 7 } as never);
    const response = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("正式考试"),
    });
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });

  it("requires both global switches and the personal permission", async () => {
    vi.mocked(getSetting).mockImplementationOnce(async () => "false");
    const globalDisabled = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    expect(globalDisabled.status).toBe(403);

    vi.mocked(getSetting).mockImplementation(async (key) =>
      key === "aiObjectiveStudentCooldownSeconds" ? "17" : "true",
    );
    vi.mocked(prisma.studentProfile.findUnique).mockResolvedValueOnce({
      objectiveAiAccessEnabled: false,
    } as never);
    const personalDisabled = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    expect(personalDisabled.status).toBe(403);
  });

  it("reads a valid shared cache without consuming the cooldown", async () => {
    const item = parseObjectiveItems(problem.objectiveItems)[0];
    vi.mocked(prisma.objectiveAiExplanation.findUnique).mockResolvedValueOnce({
      correctAnswer: "B",
      explanationJson: serializeObjectiveExplanationCore(core),
      generatedAt: new Date("2026-08-04T03:00:00.000Z"),
      model: "objective-model",
      providerFingerprint: createAiProviderFingerprint(providerConfig),
      sourceHash: createObjectiveExplanationSourceHash({
        ...problem,
        item,
        itemIndex: 1,
      }),
    } as never);

    const response = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.cooldownSeconds).toBe(0);
    expect(generateObjectiveAiExplanation).not.toHaveBeenCalled();
    expect(completeAiUsageTurn).toHaveBeenCalledWith(
      expect.objectContaining({ cached: true, providerCallCount: 0 }),
    );
  });

  it("rejects client supplied题面 or answers", async () => {
    const response = await POST(
      request({ answer: "A", itemIndex: 1, stem: "伪造题干" }) as never,
      context(),
    );
    expect(response.status).toBe(400);
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });
});
