import { describe, expect, it, vi } from "vitest";
import {
  calculateExamScore,
  getExamEndAt,
  isExamSubmissionOnTime,
  refreshFinishedExamScore,
} from "./examScoring";

describe("exam deadline scoring", () => {
  it("treats the exact deadline and later receipts as expired", () => {
    const startedAt = new Date("2026-07-10T00:00:00.000Z");
    const endAt = getExamEndAt(startedAt, 10)!;

    expect(
      isExamSubmissionOnTime({
        createdAt: endAt,
        durationMin: 10,
        startedAt,
      }),
    ).toBe(false);
    expect(
      isExamSubmissionOnTime({
        createdAt: new Date(endAt.getTime() + 1),
        durationMin: 10,
        startedAt,
      }),
    ).toBe(false);
  });

  it("filters score calculation to submissions received before the deadline", async () => {
    const deadline = new Date("2026-07-10T00:10:00.000Z");
    const db = {
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            problemId: 3,
            score: 100,
            problem: {
              id: 3,
              title: "测试题",
              problemType: "programming",
              objectiveItems: null,
            },
          },
        ]),
      },
      submission: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await calculateExamScore({
      db: db as never,
      examId: 1,
      submittedBefore: deadline,
      userId: 2,
    });

    expect(db.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: deadline } }),
      }),
    );
  });

  it("refreshes a finished exam after an on-time judge result arrives late", async () => {
    const startedAt = new Date("2026-07-10T00:00:00.000Z");
    const tx = {
      examRecord: {
        findUnique: vi.fn().mockResolvedValue({
          id: 7,
          status: "expired",
          startedAt,
          exam: { durationMin: 10 },
        }),
        update: vi.fn().mockResolvedValue({ id: 7, totalScore: 100 }),
      },
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            problemId: 3,
            score: 100,
            problem: {
              id: 3,
              title: "测试题",
              problemType: "programming",
              objectiveItems: null,
            },
          },
        ]),
      },
      submission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 9,
            problemId: 3,
            status: "Accepted",
            createdAt: new Date("2026-07-10T00:09:59.000Z"),
            caseResults: [],
          },
        ]),
      },
    };
    const db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    await refreshFinishedExamScore({
      db: db as never,
      examId: 1,
      userId: 2,
    });

    expect(tx.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: new Date("2026-07-10T00:10:00.000Z") },
        }),
      }),
    );
    expect(tx.examRecord.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { totalScore: 100 },
    });
  });
});
