import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

function request() {
  return new NextRequest("http://local.test/api/admin/problems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "新判断题",
      description: "判断下面说法是否正确。",
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
          score: 1,
        },
      ],
    }),
  });
}

describe("admin problem creation ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("places a newly created problem at the front of its type", async () => {
    const tx = {
      problem: {
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 50 } }),
        create: vi.fn().mockResolvedValue({ id: 101, testCases: [] }),
      },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(tx.problem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          problemType: "objective",
          sortOrder: 51,
        }),
      }),
    );
  });
});
