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
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
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
        {
          id: 12,
          category: "GESP 一级",
          problemType: "objective",
          testCases: [],
        },
      ])
      .mockResolvedValueOnce([
        { category: "GESP 一级" },
        { category: "GESP 一级" },
        { category: "一级模拟" },
      ]);
    mocks.prisma.problem.count.mockResolvedValue(14);

    const response = await GET(
      new NextRequest(
        "http://local.test/api/admin/problems?problemType=objective&category=GESP%20%E4%B8%80%E7%BA%A7&page=1&pageSize=20",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.categories).toEqual(["GESP 一级", "一级模拟"]);
    expect(mocks.prisma.problem.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { archivedAt: null, problemType: "objective" },
      }),
    );
  });
});
