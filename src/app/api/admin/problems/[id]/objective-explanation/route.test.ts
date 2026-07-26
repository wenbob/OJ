import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAiAssistCooldowns } from "@/lib/aiAssistRateLimit";
import {
  createAiProviderFingerprint,
  type AiProviderRuntimeConfig,
} from "@/lib/aiProvider";
import {
  createObjectiveExplanationSourceHash,
  generateObjectiveAiExplanation,
  serializeObjectiveExplanationCore,
} from "@/lib/objectiveAiExplanation";
import { clearObjectiveAiExplanationRateLimits } from "@/lib/objectiveAiExplanationRateLimit";
import { parseObjectiveItems } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { requireStaffApiUser } from "@/lib/staffAccess";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
}));

const providerConfig: AiProviderRuntimeConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
  customThinkingProtocol: "none",
  legacyFallback: false,
  model: "test-model",
  provider: "deepseek",
  thinkingMode: "disabled",
};

vi.mock("@/lib/staffAccess", () => ({
  requireStaffApiUser: vi.fn(async () => ({
    response: null,
    user: { id: 1, role: "admin", username: "admin" },
  })),
}));

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>(
    "@/lib/settings",
  );
  return {
    ...actual,
    getSetting: vi.fn(async () => "true"),
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
    generateObjectiveAiExplanation: mocks.generate,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    objectiveAiExplanation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    problem: {
      findFirst: vi.fn(),
    },
  },
}));

const objectiveItems = [
  {
    answer: "B",
    kind: "choice",
    options: [
      { label: "A", text: "处理器" },
      { label: "B", text: "存储器" },
      { label: "C", text: "输入设备" },
    ],
    score: 2,
    stem: "哪个部件负责保存数据？",
  },
];

const problem = {
  category: "基础知识",
  description: "请选择正确答案。",
  difficulty: "入门",
  objectiveItems: JSON.stringify(objectiveItems),
  title: "计算机组成",
};

const core = {
  overview: "先判断各部件职责。",
  options: [
    { label: "A", explanation: "处理器负责运算。" },
    { label: "B", explanation: "存储器负责保存数据。" },
    { label: "C", explanation: "输入设备负责采集。" },
  ],
  takeaway: "存储器用于保存数据。",
};

function request(body: unknown) {
  return new Request(
    "http://oj.local/api/admin/problems/10/objective-explanation",
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

describe("POST /api/admin/problems/:id/objective-explanation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAiAssistCooldowns();
    clearObjectiveAiExplanationRateLimits();
    vi.mocked(requireStaffApiUser).mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    vi.mocked(getSetting).mockResolvedValue("true");
    vi.mocked(prisma.problem.findFirst).mockResolvedValue(problem as never);
    vi.mocked(
      prisma.objectiveAiExplanation.findUnique,
    ).mockResolvedValue(null);
    mocks.generate.mockResolvedValue({
      completionTokens: 20,
      core,
      model: "test-model",
      promptTokens: 40,
      totalTokens: 60,
    });
    vi.mocked(prisma.objectiveAiExplanation.upsert).mockResolvedValue({
      generatedAt: new Date("2026-07-26T08:00:00Z"),
      model: "test-model",
    } as never);
  });

  it("generates from the database answer and stores only normalized output", async () => {
    const response = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.explanation.correctAnswer).toBe("B");
    expect(body.explanation.options.map((option: { isCorrect: boolean }) => option.isCorrect))
      .toEqual([false, true, false]);
    expect(prisma.objectiveAiExplanation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          correctAnswer: "B",
          generatedById: 1,
          problemId: 10,
        }),
      }),
    );
    const saved = vi.mocked(prisma.objectiveAiExplanation.upsert).mock.calls[0][0]
      .create;
    expect(JSON.stringify(saved)).not.toContain("test-key");
    expect(JSON.stringify(saved)).not.toContain("reasoning");
  });

  it("returns a valid shared cache without calling the model", async () => {
    const item = parseObjectiveItems(problem.objectiveItems)[0];
    vi.mocked(
      prisma.objectiveAiExplanation.findUnique,
    ).mockResolvedValueOnce({
      correctAnswer: "B",
      explanationJson: serializeObjectiveExplanationCore(core),
      generatedAt: new Date("2026-07-26T07:00:00Z"),
      model: "test-model",
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
    expect(generateObjectiveAiExplanation).not.toHaveBeenCalled();
  });

  it("allows teachers to generate but rejects teacher force refresh", async () => {
    vi.mocked(requireStaffApiUser).mockResolvedValue({
      response: null,
      user: { id: 2, role: "teacher", username: "teacher" },
    });
    const denied = await POST(
      request({ force: true, itemIndex: 1 }) as never,
      context(),
    );
    expect(denied.status).toBe(403);
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();

    const allowed = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    expect(allowed.status).toBe(200);
  });

  it("rejects disabled settings and student callers", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("false");
    const disabled = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    expect(disabled.status).toBe(403);
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();

    vi.mocked(requireStaffApiUser).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
      }) as never,
      user: null as never,
    });
    const student = await POST(
      request({ itemIndex: 1 }) as never,
      context(),
    );
    expect(student.status).toBe(403);
  });

  it("rejects client-supplied answers or question content", async () => {
    const response = await POST(
      request({
        answer: "A",
        itemIndex: 1,
        stem: "伪造题干",
      }) as never,
      context(),
    );
    expect(response.status).toBe(400);
    expect(prisma.problem.findFirst).not.toHaveBeenCalled();
  });
});
