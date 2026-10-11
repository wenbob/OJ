import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET as getProblemDetails } from "./[id]/route";
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
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    problemCategoryOrder: { findMany: vi.fn() },
    rewardDraw: { updateMany: vi.fn() },
    rewardChallenge: { updateMany: vi.fn() },
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
    mocks.prisma.problem.groupBy.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof mocks.prisma) => Promise<unknown>) =>
        callback(mocks.prisma),
    );
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

  it("returns full hidden test data only from the authenticated detail endpoint", async () => {
    mocks.prisma.problem.findUnique.mockResolvedValue({
      archivedAt: null,
      category: "基础",
      dataRange: "1 <= n <= 10",
      description: "完整题面",
      difficulty: "入门",
      id: 12,
      inputDescription: "输入",
      objectiveItems: null,
      outputDescription: "输出",
      problemType: "programming",
      sampleInput: "1",
      sampleOutput: "1",
      testCases: [
        { id: 8, input: "hidden-input", isSample: false, output: "hidden-output" },
      ],
      title: "测试题",
    });

    const response = await getProblemDetails(request("GET"), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problem.testCases[0]).toMatchObject({
      input: "hidden-input",
      output: "hidden-output",
    });
    expect(mocks.prisma.problem.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          testCases: expect.objectContaining({
            select: { id: true, input: true, isSample: true, output: true },
          }),
        }),
      }),
    );
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
      rewardDraw: { updateMany: vi.fn() },
      rewardChallenge: { updateMany: vi.fn() },
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
    mocks.prisma.problem.groupBy.mockResolvedValue([
      { category: "GESP 一级" },
      { category: "一级模拟" },
    ]);
    mocks.prisma.problem.findMany.mockResolvedValueOnce([
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
    expect(mocks.prisma.problem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["category"],
        where: { archivedAt: null, problemType: "objective" },
      }),
    );
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("returns summary rows without statements, answers, or hidden test bodies", async () => {
    mocks.prisma.problem.groupBy.mockResolvedValue([{ category: "基础" }]);
    mocks.prisma.problem.findMany.mockResolvedValueOnce([
      {
        _count: { testCases: 3 },
        category: "基础",
        description: "must-not-leak-description",
        difficulty: "入门",
        id: 12,
        objectiveItems: null,
        problemType: "programming",
        testCases: [
          { input: "must-not-leak-input", output: "must-not-leak-output" },
        ],
        title: "A+B",
      },
    ]);
    mocks.prisma.problem.count.mockResolvedValue(1);

    const response = await GET(
      new NextRequest(
        "http://local.test/api/admin/problems?problemType=programming",
      ),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({ itemCount: 3, title: "A+B" });
    expect(serialized).not.toContain("must-not-leak");
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        select: expect.any(Object),
      }),
    );
    expect(
      mocks.prisma.problem.findMany.mock.calls[0]?.[0],
    ).not.toHaveProperty("include");
  });

  it("sorts titles naturally before applying pagination", async () => {
    mocks.prisma.problem.groupBy.mockResolvedValue([{ category: "综合" }]);
    mocks.prisma.problem.findMany
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
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [1, 2] } }),
      }),
    );
  });

  it("uses creation time only as an administrator view sort", async () => {
    mocks.prisma.problem.groupBy.mockResolvedValue([{ category: "综合" }]);
    mocks.prisma.problem.findMany.mockResolvedValueOnce([]);
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
      1,
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: 0,
        take: 50,
      }),
    );
  });
  it("combines all filters before counting and paginating and keeps Accepted scoped to the admin", async () => {
    mocks.requireApiUser.mockResolvedValue({ user: { id: 37, role: "admin" } });
    mocks.prisma.problem.count.mockResolvedValue(3);
    mocks.prisma.problem.findMany.mockResolvedValue([{ id: 101, title: "101 回归", category: "综合", problemType: "programming", testCases: [] }]);
    mocks.prisma.problem.groupBy.mockImplementation(({ by }: { by: string[] }) => Promise.resolve(by[0] === "difficulty" ? [{ difficulty: "入门" }, { difficulty: "进阶" }] : [{ category: "综合" }]));
    const response = await GET(new NextRequest("http://local.test/api/admin/problems?problemType=programming&category=综合&q=00101&difficulty=入门&completion=accepted&page=2&pageSize=1"));
    const body = await response.json();
    const where = { archivedAt: null, problemType: "programming", category: "综合", difficulty: "入门", OR: [{ id: 101 }, { title: { contains: "00101" } }], submissions: { some: { userId: 37, status: "Accepted" } } };
    expect(mocks.prisma.problem.count).toHaveBeenCalledWith({ where });
    expect(mocks.prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 1, take: 1 }));
    expect(body).toMatchObject({ total: 3, page: 2, pageSize: 1, difficulties: ["入门", "进阶"] });
    expect(body.items[0]).toMatchObject({ canMoveUp: false, canMoveDown: false });
    expect(mocks.requireApiUser).toHaveBeenCalledWith(expect.any(NextRequest), "admin");
  });
});
