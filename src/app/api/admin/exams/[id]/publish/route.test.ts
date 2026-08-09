import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    exam: { findFirst: vi.fn() },
  },
  requireStaffApiUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/staffAccess", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staffAccess")>(
    "@/lib/staffAccess",
  );
  return { ...actual, requireStaffApiUser: mocks.requireStaffApiUser };
});

describe("exam publishing snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffApiUser.mockResolvedValue({
      response: null,
      user: { id: 1, role: "admin", username: "admin" },
    });
    mocks.prisma.exam.findFirst.mockResolvedValue({
      durationMin: 60,
      examType: "programming",
      problems: [
        {
          id: 8,
          score: 100,
          problem: {
            archivedAt: null,
            objectiveItems: null,
            problemType: "programming",
            title: "A+B",
          },
        },
      ],
      status: "draft",
      title: "正式考试",
    });
  });

  it("writes snapshots before changing the exam status", async () => {
    const tx = {
      exam: {
        update: vi.fn().mockResolvedValue({ id: 3, status: "published" }),
      },
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 8,
            score: 100,
            problem: {
              objectiveItems: null,
              problemType: "programming",
              title: "A+B",
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const response = await POST(
      new NextRequest("http://oj.local/api/admin/exams/3/publish", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "3" }) },
    );

    expect(response.status).toBe(200);
    expect(tx.examProblem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshotProblemType: "programming",
          snapshotScore: 100,
          snapshotTitle: "A+B",
        }),
      }),
    );
    expect(tx.exam.update).toHaveBeenCalledWith({
      data: { status: "published" },
      where: { id: 3 },
    });
  });

  it("does not republish an ended exam", async () => {
    mocks.prisma.exam.findFirst.mockResolvedValueOnce({
      durationMin: 60,
      examType: "programming",
      problems: [],
      status: "ended",
      title: "已经结束的考试",
    });

    const response = await POST(
      new NextRequest("http://oj.local/api/admin/exams/3/publish", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "3" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
