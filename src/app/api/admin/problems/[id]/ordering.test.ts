import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

function request() {
  return new NextRequest("http://local.test/api/admin/problems/12", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "改为判断题",
      description: "判断下面说法。",
      difficulty: "入门",
      category: "GESP 一级",
      problemType: "objective",
      objectiveItems: [
        {
          kind: "judge",
          stem: "C++ 区分大小写。",
          options: [
            { label: "A", text: "正确" },
            { label: "B", text: "错误" },
          ],
          answer: "A",
          score: 2,
        },
      ],
    }),
  });
}

describe("admin problem type-change ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("moves a problem to the front when its type changes", async () => {
    const tx = {
      examProblem: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      objectiveAiExplanation: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      problem: {
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 20 } }),
        findUnique: vi.fn().mockResolvedValue({
          archivedAt: null,
          problemType: "programming",
        }),
        update: vi.fn().mockResolvedValue({ id: 12, testCases: [] }),
      },
      testCase: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await PUT(request(), { params: Promise.resolve({ id: "12" }) });

    expect(response.status).toBe(200);
    expect(tx.problem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          problemType: "objective",
          sortOrder: 21,
        }),
      }),
    );
    expect(tx.objectiveAiExplanation.deleteMany).toHaveBeenCalledWith({
      where: {
        itemIndex: { gt: 1 },
        problemId: 12,
      },
    });
  });

  it("rejects edits while the problem belongs to a published exam", async () => {
    const tx = {
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            exam: {
              examType: "objective",
              status: "published",
              title: "正在考试",
            },
          },
        ]),
        updateMany: vi.fn(),
      },
      objectiveAiExplanation: { deleteMany: vi.fn() },
      problem: {
        findUnique: vi.fn().mockResolvedValue({
          archivedAt: null,
          problemType: "programming",
        }),
        update: vi.fn(),
      },
      testCase: { deleteMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await PUT(request(), {
      params: Promise.resolve({ id: "12" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("正在考试");
    expect(tx.testCase.deleteMany).not.toHaveBeenCalled();
    expect(tx.problem.update).not.toHaveBeenCalled();
  });
});
