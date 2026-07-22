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
  return new NextRequest("http://local.test/api/admin/problems/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createTransaction() {
  return {
    problem: {
      findUnique: vi.fn().mockResolvedValue({
        id: 2,
        archivedAt: null,
        category: "循环",
        problemType: "programming",
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: 1, sortOrder: 30 },
        { id: 2, sortOrder: 20 },
        { id: 3, sortOrder: 10 },
      ]),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("admin problem custom ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
  });

  it("swaps the target with the adjacent problem in one transaction", async () => {
    const tx = createTransaction();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 2,
        problemType: "programming",
        direction: "up",
        category: "",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ moved: true, position: 1 });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { sortOrder: 30 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sortOrder: 20 },
    });
  });

  it("limits movement to the selected category", async () => {
    const tx = createTransaction();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await POST(
      request({
        problemId: 2,
        problemType: "programming",
        direction: "down",
        category: "循环",
      }),
    );

    expect(tx.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          problemType: "programming",
          category: "循环",
        },
      }),
    );
  });

  it("moves a dragged problem before a non-adjacent target", async () => {
    const tx = createTransaction();
    tx.problem.findMany.mockResolvedValue([
      { id: 1, sortOrder: 40 },
      { id: 2, sortOrder: 30 },
      { id: 3, sortOrder: 20 },
      { id: 4, sortOrder: 10 },
    ]);
    tx.problem.findUnique.mockResolvedValue({
      id: 4,
      archivedAt: null,
      category: "循环",
      problemType: "programming",
    });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 4,
        targetProblemId: 2,
        placement: "before",
        problemType: "programming",
        category: "循环",
      }),
    );

    expect(await response.json()).toEqual({ moved: true, position: 2 });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { sortOrder: 30 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { sortOrder: 20 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { sortOrder: 10 },
    });
  });

  it("treats dropping a problem onto itself as a no-op", async () => {
    const tx = createTransaction();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 2,
        targetProblemId: 2,
        placement: "after",
        problemType: "programming",
      }),
    );

    expect(await response.json()).toEqual({ moved: false, position: 2 });
    expect(tx.problem.update).not.toHaveBeenCalled();
  });

  it("rejects mixed arrow and drag movement parameters", async () => {
    const response = await POST(
      request({
        problemId: 2,
        targetProblemId: 1,
        placement: "before",
        direction: "up",
        problemType: "programming",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a drag target outside the selected category", async () => {
    const tx = createTransaction();
    tx.problem.findUnique
      .mockResolvedValueOnce({
        id: 2,
        archivedAt: null,
        category: "循环",
        problemType: "programming",
      })
      .mockResolvedValueOnce({
        id: 1,
        archivedAt: null,
        category: "数组",
        problemType: "programming",
      });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 2,
        targetProblemId: 1,
        placement: "before",
        problemType: "programming",
        category: "循环",
      }),
    );

    expect(response.status).toBe(400);
    expect(tx.problem.update).not.toHaveBeenCalled();
  });

  it("normalizes duplicate legacy sort values before moving", async () => {
    const tx = createTransaction();
    tx.problem.findMany
      .mockResolvedValueOnce([
        { id: 1, sortOrder: 20 },
        { id: 2, sortOrder: 20 },
        { id: 3, sortOrder: 10 },
      ])
      .mockResolvedValueOnce([
        { id: 1, sortOrder: 3 },
        { id: 2, sortOrder: 2 },
        { id: 3, sortOrder: 1 },
      ]);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 2,
        problemType: "programming",
        direction: "down",
      }),
    );

    expect(response.status).toBe(200);
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sortOrder: 3 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { sortOrder: 2 },
    });
    expect(tx.problem.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { sortOrder: 1 },
    });
  });

  it("returns a boundary result without writing", async () => {
    const tx = createTransaction();
    tx.problem.findUnique.mockResolvedValue({
      id: 1,
      archivedAt: null,
      category: "循环",
      problemType: "programming",
    });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      request({
        problemId: 1,
        problemType: "programming",
        direction: "up",
      }),
    );

    expect(await response.json()).toEqual({ moved: false, position: 1 });
    expect(tx.problem.update).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before accessing the database", async () => {
    mocks.requireApiUser.mockResolvedValue({
      response: NextResponse.json({ error: "无权限" }, { status: 403 }),
      user: null,
    });

    const response = await POST(
      request({ problemId: 2, problemType: "programming", direction: "up" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
