import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

function request(body: unknown) {
  return new NextRequest("http://local.test/api/admin/problems/order/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createTransaction() {
  const rows = [
    {
      id: 10,
      title: "第 10 题",
      createdAt: new Date("2026-01-02"),
      sortOrder: 30,
    },
    {
      id: 2,
      title: "第 2 题",
      createdAt: new Date("2026-01-03"),
      sortOrder: 20,
    },
    {
      id: 1,
      title: "第 1 题",
      createdAt: new Date("2026-01-01"),
      sortOrder: 10,
    },
  ];
  return {
    problem: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("save administrator problem ordering view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("saves a natural title sort across the complete filtered scope", async () => {
    const tx = createTransaction();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemType: "programming",
        category: "循环",
        sort: "title-asc",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 3, sort: "custom" });
    expect(tx.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          problemType: "programming",
          category: "循环",
        },
      }),
    );
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sortOrder: 30 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { sortOrder: 10 },
    });
  });

  it("rejects custom and unknown sort modes", async () => {
    for (const sort of ["custom", "unknown"]) {
      const response = await POST(
        request({ problemType: "programming", sort }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["title-desc", "newest", "oldest"] as const)(
    "accepts the %s view as a saved snapshot",
    async (sort) => {
      const tx = createTransaction();
      mocks.prisma.$transaction.mockImplementation(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      );

      const response = await POST(
        request({ problemType: "programming", sort }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).sort).toBe("custom");
    },
  );

  it("rejects non-admin callers before writing", async () => {
    mocks.requireApiUser.mockResolvedValue({
      response: NextResponse.json({ error: "无权限" }, { status: 403 }),
      user: null,
    });

    const response = await POST(
      request({ problemType: "programming", sort: "newest" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
