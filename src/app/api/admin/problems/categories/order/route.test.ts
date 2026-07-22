import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    problem: { findMany: vi.fn() },
  },
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

function request(body: unknown) {
  return new NextRequest(
    "http://local.test/api/admin/problems/categories/order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("admin problem category ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    mocks.prisma.problem.findMany.mockResolvedValue([
      { category: "数组" },
      { category: "循环" },
      { category: "数组" },
    ]);
  });

  it("persists a complete category sequence", async () => {
    const tx = {
      problemCategoryOrder: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemType: "programming",
        categories: ["循环", "数组"],
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      categories: ["循环", "数组"],
      ok: true,
    });
    expect(tx.problemCategoryOrder.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: { problemType: "programming", category: "循环", sortOrder: 0 },
      }),
    );
  });

  it("rejects an incomplete category list", async () => {
    const response = await POST(
      request({ problemType: "programming", categories: ["数组"] }),
    );

    expect(response.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers", async () => {
    mocks.requireApiUser.mockResolvedValue({
      response: NextResponse.json({ error: "无权限" }, { status: 403 }),
      user: null,
    });

    const response = await POST(
      request({ problemType: "programming", categories: ["数组", "循环"] }),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.problem.findMany).not.toHaveBeenCalled();
  });
});
