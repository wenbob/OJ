import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { settleStudentExamsForLoginAndRotateSession } from "./examScoring";

describe("resumed exam login allowance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        examProblem: { findMany: vi.fn().mockResolvedValue([]) },
        examRecord: { findMany: mocks.findMany, update: mocks.update },
        submission: { findMany: vi.fn().mockResolvedValue([]) },
        user: { update: mocks.userUpdate },
      }),
    );
    mocks.update.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({
      id: 7,
      role: "student",
      sessionVersion: 4,
      username: "alice",
    });
  });

  it("consumes one valid allowance without submitting the resumed exam", async () => {
    mocks.findMany.mockResolvedValue([
      {
        exam: { durationMin: 60, status: "published" },
        examId: 8,
        id: 18,
        resumeLoginAllowed: true,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ]);

    const result = await settleStudentExamsForLoginAndRotateSession(7);

    expect(result).toEqual({
      id: 7,
      role: "student",
      sessionVersion: 4,
      username: "alice",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      data: { resumeLoginAllowed: false },
      where: { id: 18 },
    });
  });

  it("expires an allowance after the original deadline", async () => {
    mocks.findMany.mockResolvedValue([
      {
        exam: { durationMin: 10, status: "published" },
        examId: 8,
        id: 18,
        resumeLoginAllowed: true,
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    ]);

    await settleStudentExamsForLoginAndRotateSession(7);

    expect(mocks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeLoginAllowed: false,
        status: "expired",
      }),
      where: { id: 18 },
    });
  });

  it("fails closed when duplicate resume allowances exist", async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000);
    mocks.findMany.mockResolvedValue([
      {
        exam: { durationMin: 60, status: "published" },
        examId: 8,
        id: 18,
        resumeLoginAllowed: true,
        startedAt,
      },
      {
        exam: { durationMin: 60, status: "published" },
        examId: 9,
        id: 19,
        resumeLoginAllowed: true,
        startedAt,
      },
    ]);

    await settleStudentExamsForLoginAndRotateSession(7);

    expect(mocks.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted" }),
        where: { id: 18 },
      }),
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      data: { sessionVersion: { increment: 1 } },
      select: {
        id: true,
        role: true,
        sessionVersion: true,
        username: true,
      },
      where: { id: 7 },
    });
    expect(mocks.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted" }),
        where: { id: 19 },
      }),
    );
  });
});
