import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  accepted: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  practiceCounts: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { problem: { count: mocks.count, findMany: mocks.findMany } },
}));
vi.mock("@/lib/problemSubmissionCounts", () => ({
  getAcceptedProblemIds: mocks.accepted,
  getPracticeSubmissionCountsByProblem: mocks.practiceCounts,
}));

describe("problems API accepted marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      response: null,
      user: { id: 9, role: "student", username: "alice" },
    });
    mocks.findMany.mockResolvedValue([
      {
        category: "循环",
        createdAt: new Date("2026-07-16T00:00:00.000Z"),
        difficulty: "入门",
        id: 2,
        problemType: "programming",
        title: "求和",
      },
    ]);
    mocks.count.mockResolvedValue(1);
    mocks.practiceCounts.mockResolvedValue(new Map([[2, 3]]));
    mocks.accepted.mockResolvedValue(new Set([2]));
  });

  it("returns isAccepted using all historical Accepted submissions", async () => {
    const response = await GET(
      new NextRequest(
        "http://oj.local/api/problems?problemType=programming&sort=oldest",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({
      id: 2,
      isAccepted: true,
      mySubmissionCount: 3,
    });
    expect(body).toMatchObject({
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    expect(mocks.accepted).toHaveBeenCalledWith({
      problemIds: [2],
      userId: 9,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
        skip: 0,
        take: 50,
      }),
    );
  });

  it("keeps an explicit compatible page size", async () => {
    const response = await GET(
      new NextRequest(
        "http://oj.local/api/problems?problemType=programming&page=2&pageSize=20",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ page: 2, pageSize: 20 });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });
});
