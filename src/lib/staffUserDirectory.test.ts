import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submissionGroupBy: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: { groupBy: mocks.submissionGroupBy },
    user: {
      count: mocks.userCount,
      findMany: mocks.userFindMany,
    },
  },
}));

import { getStaffUserPage } from "./staffUserDirectory";

describe("staff user directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userCount.mockResolvedValue(1);
    mocks.userFindMany.mockResolvedValue([
      {
        _count: { submissions: 8 },
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        id: 7,
        role: "student",
        studentProfile: {
          aiAccessEnabled: true,
          customTitle: null,
          objectiveAiAccessEnabled: false,
        },
        username: "alice",
      },
    ]);
    mocks.submissionGroupBy
      .mockResolvedValueOnce([{ _count: { _all: 4 }, userId: 7 }])
      .mockResolvedValueOnce([
        { _count: { _all: 3 }, problemId: 1, userId: 7 },
        { _count: { _all: 1 }, problemId: 2, userId: 7 },
      ]);
  });

  it("queries only the requested page and aggregates rankings in the database", async () => {
    const result = await getStaffUserPage({
      page: 2,
      pageSize: 20,
      query: "ali",
      viewerRole: "admin",
    });

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: { username: { contains: "ali" } },
      }),
    );
    expect(mocks.submissionGroupBy).toHaveBeenCalledTimes(2);
    expect(result.users[0]?.ranking).toMatchObject({
      acceptedSubmissionCount: 4,
      acCount: 2,
      points: 20,
    });
  });

  it("always confines teachers to student accounts", async () => {
    await getStaffUserPage({ query: "bob", viewerRole: "teacher" });

    expect(mocks.userCount).toHaveBeenCalledWith({
      where: { role: "student", username: { contains: "bob" } },
    });
  });
});
