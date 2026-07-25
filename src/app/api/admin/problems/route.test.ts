import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./[id]/route";
import { POST as bulkArchive } from "./bulk-delete/route";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    examProblem: { findFirst: vi.fn() },
    learningAssignmentProblem: { count: vi.fn() },
    problem: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    problemCategoryOrder: { findMany: vi.fn() },
  },
  requireApiUser: vi.fn(),
  getPracticeSubmissionCountsByProblem: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/problemSubmissionCounts", () => ({
  getPracticeSubmissionCountsByProblem:
    mocks.getPracticeSubmissionCountsByProblem,
}));

function request(method = "DELETE", body?: unknown) {
  return new Request("http://local.test/api/admin/problems/12", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  }) as NextRequest;
}

function context(id = "12") {
  return { params: Promise.resolve({ id }) };
}

describe("admin problem archiving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    mocks.prisma.learningAssignmentProblem.count.mockResolvedValue(0);
    mocks.prisma.examProblem.findFirst.mockResolvedValue(null);
    mocks.prisma.problem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.problemCategoryOrder.findMany.mockResolvedValue([]);
    mocks.getPracticeSubmissionCountsByProblem.mockResolvedValue(new Map());
  });

  it("archives one problem without deleting its history", async () => {
    const response = await DELETE(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.archivedCount).toBe(1);
    expect(mocks.prisma.problem.updateMany).toHaveBeenCalledWith({
      data: { archivedAt: expect.any(Date) },
      where: { archivedAt: null, id: 12 },
    });
  });

  it("refuses to archive a problem from a published exam", async () => {
    mocks.prisma.examProblem.findFirst.mockResolvedValue({
      exam: { title: "期中考试" },
    });

    const response = await DELETE(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.prisma.problem.updateMany).not.toHaveBeenCalled();
  });

  it("archives a batch in one transaction", async () => {
    const tx = {
      examProblem: { findFirst: vi.fn().mockResolvedValue(null) },
      learningAssignmentProblem: { findFirst: vi.fn().mockResolvedValue(null) },
      problem: {
        findMany: vi.fn().mockResolvedValue([{ id: 12 }, { id: 13 }]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<number>) => callback(tx),
    );

    const response = await bulkArchive(
      request("POST", { problemIds: [12, 13] }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.archivedCount).toBe(2);
    expect(tx.problem.updateMany).toHaveBeenCalledWith({
      data: { archivedAt: expect.any(Date) },
      where: { archivedAt: null, id: { in: [12, 13] } },
    });
  });

  it("returns every category for the selected problem type, not only the current page", async () => {
    mocks.prisma.problem.findMany
      .mockResolvedValueOnce([
        { category: "GESP 一级" },
        { category: "GESP 一级" },
        { category: "一级模拟" },
      ])
      .mockResolvedValueOnce([
        {
          id: 12,
          category: "GESP 一级",
          problemType: "objective",
          testCases: [],
        },
      ]);
    mocks.prisma.problem.count.mockResolvedValue(14);

    const response = await GET(
      new NextRequest(
        "http://local.test/api/admin/problems?problemType=objective&category=GESP%20%E4%B8%80%E7%BA%A7&page=1&pageSize=20",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.categories).toEqual(["一级模拟", "GESP 一级"]);
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { archivedAt: null, problemType: "objective" },
      }),
    );
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("sorts titles naturally before applying pagination", async () => {
    mocks.prisma.problem.findMany
      .mockResolvedValueOnce([{ category: "综合" }])
      .mockResolvedValueOnce([
        { id: 10, title: "第 10 题" },
        { id: 2, title: "第 2 题" },
        { id: 1, title: "第 1 题" },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          title: "第 2 题",
          category: "综合",
          problemType: "programming",
          testCases: [],
        },
        {
          id: 1,
          title: "第 1 题",
          category: "综合",
          problemType: "programming",
          testCases: [],
        },
      ]);
    mocks.prisma.problem.count.mockResolvedValue(3);

    const response = await GET(
      new NextRequest(
        "http://local.test/api/admin/problems?problemType=programming&sort=title-asc&page=1&pageSize=2",
      ),
    );
    const body = await response.json();

    expect(body.sort).toBe("title-asc");
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([1, 2]);
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [1, 2] } }),
      }),
    );
  });

  it("uses creation time only as an administrator view sort", async () => {
    mocks.prisma.problem.findMany
      .mockResolvedValueOnce([{ category: "综合" }])
      .mockResolvedValueOnce([]);
    mocks.prisma.problem.count.mockResolvedValue(0);

    const response = await GET(
      new NextRequest(
        "http://local.test/api/admin/problems?problemType=programming&sort=oldest",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: 0,
        take: 50,
      }),
    );
  });
});
