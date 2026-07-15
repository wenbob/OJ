import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiUser } from "@/lib/auth";
import {
  createTeacherInsightInput,
  hashTeacherInsightInput,
  requestTeacherLearningInsight,
} from "@/lib/teacherLearningInsight";
import { clearTeacherInsightRateLimits } from "@/lib/teacherInsightRateLimit";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  requestInsight: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiUser: vi.fn(async () => ({
    user: { id: 1, username: "admin", role: "admin" },
    response: null,
  })),
}));

vi.mock("@/lib/teacherLearning", () => ({
  getTeacherLearningStudentDetail: mocks.getDetail,
}));

vi.mock("@/lib/teacherLearningInsight", async () => {
  const actual = await vi.importActual<typeof import("@/lib/teacherLearningInsight")>(
    "@/lib/teacherLearningInsight",
  );
  return { ...actual, requestTeacherLearningInsight: mocks.requestInsight };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    learningInsightSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const analytics = {
  categories: [],
  hasLearningData: true,
  issueLabels: ["逻辑判断需加强"],
  latestFailures: [],
  pendingProblems: [],
  problems: [],
  statusCounts: { "Wrong Answer": 2 },
  stuckProblems: [],
  summary: {
    acceptedProblemCount: 1,
    attemptedProblemCount: 2,
    failedSubmissionCount: 2,
    lastTrainingAt: new Date("2026-07-15T08:00:00Z"),
    pendingProblemCount: 1,
    submissionCount: 3,
    uniqueAcceptedInWindow: 1,
  },
  window: "30d" as const,
  windowStartedAt: new Date("2026-06-15T08:00:00Z"),
};

const detail = {
  analytics,
  recommendations: { shortageCategories: ["循环"] },
  student: { id: 7, username: "student" },
};

function request(body: unknown) {
  return new Request("http://oj.local/api/admin/learning/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/learning/insight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTeacherInsightRateLimits();
    mocks.getDetail.mockResolvedValue(detail);
    mocks.requestInsight.mockResolvedValue("主要问题：逻辑判断需要加强。\n数据依据：Wrong Answer 2 次。\n教学建议：先练条件判断。\n专项练习重点：循环。 ");
    vi.mocked(prisma.learningInsightSnapshot.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.learningInsightSnapshot.upsert).mockResolvedValue({
      generatedAt: new Date("2026-07-15T09:00:00Z"),
    } as never);
  });

  it("allows admins and stores an aggregate-only generated summary", async () => {
    const response = await POST(request({ studentId: 7, window: "30d" }) as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(requestTeacherLearningInsight).toHaveBeenCalledWith(
      expect.not.stringContaining("#include"),
    );
    expect(prisma.learningInsightSnapshot.upsert).toHaveBeenCalled();
  });

  it("returns a matching database snapshot without calling DeepSeek", async () => {
    const input = createTeacherInsightInput({
      analytics,
      shortageCategories: ["循环"],
      username: "student",
    });
    vi.mocked(prisma.learningInsightSnapshot.findUnique).mockResolvedValueOnce({
      generatedAt: new Date("2026-07-15T08:30:00Z"),
      inputHash: hashTeacherInsightInput(input),
      summary: "缓存摘要",
    } as never);
    const response = await POST(request({ studentId: 7, window: "30d" }) as never);
    const body = await response.json();
    expect(body.cached).toBe(true);
    expect(body.aiSummary).toBe("缓存摘要");
    expect(requestTeacherLearningInsight).not.toHaveBeenCalled();
  });

  it("keeps rule data available when DeepSeek fails", async () => {
    mocks.requestInsight.mockRejectedValueOnce(new Error("AI 服务异常"));
    const response = await POST(request({ studentId: 7, window: "30d" }) as never);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toContain("AI 服务异常");
    expect(body.rules.summary.submissionCount).toBe(3);
  });

  it("rejects non-admin callers", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "权限不足" }), { status: 403 }) as never,
    });
    const response = await POST(request({ studentId: 7, window: "30d" }) as never);
    expect(response.status).toBe(403);
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });
});
