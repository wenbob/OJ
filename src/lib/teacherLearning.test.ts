import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    learningAssignment: { findMany: vi.fn() },
    problem: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import { getTeacherLearningDashboard } from "./teacherLearning";

describe("teacher learning submission queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 7, username: "student" },
    ]);
    mocks.prisma.problem.findMany.mockResolvedValue([
      {
        archivedAt: null,
        category: "基础",
        difficulty: "入门",
        id: 12,
        problemType: "programming",
        title: "A+B",
      },
    ]);
    mocks.prisma.learningAssignment.findMany.mockResolvedValue([]);
  });

  it("loads a bounded window plus compact historical accepted/latest rows", async () => {
    mocks.prisma.submission.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        id: 20,
        problemId: 12,
        status: "Wrong Answer",
        submissionType: "practice",
        userId: 7,
      },
    ]);
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        id: 3,
        problemId: 12,
        status: "Accepted",
        submissionType: "practice",
        userId: 7,
      },
    ]);

    const dashboard = await getTeacherLearningDashboard("7d");

    expect(mocks.prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gte: expect.any(Date) } }),
      }),
    );
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(dashboard.rows[0]?.analytics.problems[0]).toMatchObject({
      acceptedEver: true,
      failedAfterLastAccepted: 1,
      latestStatus: "Wrong Answer",
    });
  });

  it("aggregates full history in SQLite instead of loading every submission", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          acceptedEver: 1,
          failedAfterLastAccepted: 2,
          latestStatus: "Wrong Answer",
          latestSubmissionAt: new Date("2026-07-15T00:00:00.000Z"),
          latestSubmissionId: 20,
          problemId: 12,
          userId: 7,
          windowFailedCount: 4,
        },
      ])
      .mockResolvedValueOnce([
        { count: 1, status: "Accepted", userId: 7 },
        { count: 4, status: "Wrong Answer", userId: 7 },
      ]);

    const dashboard = await getTeacherLearningDashboard("all");

    expect(mocks.prisma.submission.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(dashboard.rows[0]?.analytics.summary).toMatchObject({
      acceptedProblemCount: 1,
      failedSubmissionCount: 4,
      submissionCount: 5,
    });
    expect(mocks.prisma.learningAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          problems: { some: { completedAt: null } },
          status: "active",
        },
      }),
    );
  });
});
