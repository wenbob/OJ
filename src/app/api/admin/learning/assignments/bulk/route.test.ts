import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BulkLearningAssignmentConflictError,
  BulkLearningAssignmentInvalidProblemError,
  createBulkLearningAssignments,
  validateBulkLearningAssignmentDraft,
} from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import { requireStaffApiUser } from "@/lib/staffAccess";
import { POST } from "./route";

vi.mock("@/lib/learningAssignments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/learningAssignments")>();
  return {
    ...actual,
    createBulkLearningAssignments: vi.fn(),
    validateBulkLearningAssignmentDraft: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn() },
}));

vi.mock("@/lib/staffAccess", () => ({
  requireStaffApiUser: vi.fn(),
}));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(
    "http://oj.local/api/admin/learning/assignments/bulk",
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
      method: "POST",
    },
  );
}

const draft = {
  assignments: [
    { problemIds: [101, 102], studentId: 12 },
    { problemIds: [101, 103], studentId: 18 },
  ],
  dueAt: null,
  note: "请按顺序完成",
  title: "课后练习",
};

describe("POST /api/admin/learning/assignments/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaffApiUser).mockResolvedValue({
      response: null,
      user: { id: 7, role: "teacher", username: "coach" },
    });
    vi.mocked(validateBulkLearningAssignmentDraft).mockReturnValue({
      data: draft,
      error: null,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({} as never),
    );
    vi.mocked(createBulkLearningAssignments).mockResolvedValue([
      { id: 301, problemCount: 2, studentId: 12, username: "student01" },
      { id: 302, problemCount: 2, studentId: 18, username: "student02" },
    ]);
  });

  it("creates all assignments in one transaction for a staff user", async () => {
    const response = await POST(request(draft));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      createdCount: 2,
    });
    expect(createBulkLearningAssignments).toHaveBeenCalledWith({
      createdById: 7,
      db: {},
      draft,
    });
  });

  it("returns structured conflicts with zero partial-success response", async () => {
    vi.mocked(createBulkLearningAssignments).mockRejectedValueOnce(
      new BulkLearningAssignmentConflictError([
        {
          problems: [{ problemId: 101, title: "循环求和" }],
          studentId: 12,
          username: "student01",
        },
      ]),
    );

    const response = await POST(request(draft));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      conflicts: [
        {
          problems: [{ problemId: 101, title: "循环求和" }],
          studentId: 12,
          username: "student01",
        },
      ],
      error: "部分学生存在重复未完成题，未发布任何作业",
    });
  });

  it("returns the exact problems that became unavailable", async () => {
    vi.mocked(createBulkLearningAssignments).mockRejectedValueOnce(
      new BulkLearningAssignmentInvalidProblemError([
        { problemId: 103, reason: "archived", title: "数组练习" },
      ]),
    );

    const response = await POST(request(draft));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "部分题目不存在或已下架，请重新选择",
      invalidProblems: [
        { problemId: 103, reason: "archived", title: "数组练习" },
      ],
    });
  });

  it("rejects invalid drafts and unauthorized callers before a transaction", async () => {
    vi.mocked(validateBulkLearningAssignmentDraft).mockReturnValueOnce({
      data: null,
      error: "一次必须选择 1 至 100 名学生",
    });
    const invalidResponse = await POST(request({}));
    expect(invalidResponse.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    vi.mocked(requireStaffApiUser).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
      }) as never,
      user: null as never,
    });
    const forbiddenResponse = await POST(request(draft));
    expect(forbiddenResponse.status).toBe(403);
  });

  it("keeps the existing 64KB JSON request limit", async () => {
    const response = await POST(
      request(draft, { "content-length": String(64 * 1024 + 1) }),
    );

    expect(response.status).toBe(413);
    expect(validateBulkLearningAssignmentDraft).not.toHaveBeenCalled();
  });
});
