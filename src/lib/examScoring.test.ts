import { describe, expect, it, vi } from "vitest";
import {
  calculateExamScore,
  getExamEndAt,
  isExamSubmissionOnTime,
  refreshFinishedExamScore,
  selectBestObjectiveSubmission,
} from "./examScoring";

describe("exam deadline scoring", () => {
  const objectiveItems = [
    {
      answer: "A",
      kind: "choice" as const,
      options: [
        { label: "A", text: "选项 A" },
        { label: "B", text: "选项 B" },
      ],
      score: 2,
      stem: "第 1 题",
    },
    {
      answer: "B",
      kind: "choice" as const,
      options: [
        { label: "A", text: "选项 A" },
        { label: "B", text: "选项 B" },
      ],
      score: 3,
      stem: "第 2 题",
    },
  ];

  it("selects the highest-scoring objective submission for review", () => {
    const selected = selectBestObjectiveSubmission({
      items: objectiveItems,
      submissions: [
        {
          caseResults: [
            { caseIndex: 1, status: "Accepted" },
            { caseIndex: 2, status: "Accepted" },
          ],
          createdAt: new Date("2026-07-26T00:00:00.000Z"),
          id: 10,
        },
        {
          caseResults: [
            { caseIndex: 1, status: "Wrong Answer" },
            { caseIndex: 2, status: "Accepted" },
          ],
          createdAt: new Date("2026-07-26T01:00:00.000Z"),
          id: 11,
        },
      ],
    });

    expect(selected).toMatchObject({ score: 5, submissionId: 10 });
  });

  it("breaks equal objective scores by newer time and then larger id", () => {
    const tiedCases = [
      { caseIndex: 1, status: "Accepted" },
      { caseIndex: 2, status: "Wrong Answer" },
    ];
    const selected = selectBestObjectiveSubmission({
      items: objectiveItems,
      submissions: [
        {
          caseResults: tiedCases,
          createdAt: new Date("2026-07-26T00:00:00.000Z"),
          id: 10,
        },
        {
          caseResults: tiedCases,
          createdAt: new Date("2026-07-26T01:00:00.000Z"),
          id: 11,
        },
        {
          caseResults: tiedCases,
          createdAt: new Date("2026-07-26T01:00:00.000Z"),
          id: 12,
        },
      ],
    });

    expect(selected).toMatchObject({ score: 2, submissionId: 12 });
  });

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

  it("uses published snapshot values after the reusable problem changes", async () => {
    const publishedItems = [
      {
        answer: "A",
        kind: "choice" as const,
        options: [
          { label: "A", text: "旧选项 A" },
          { label: "B", text: "旧选项 B" },
        ],
        score: 2,
        stem: "旧题干",
      },
    ];
    const db = {
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            problemId: 3,
            score: 100,
            snapshotObjectiveItems: JSON.stringify(publishedItems),
            snapshotProblemType: "objective",
            snapshotScore: 2,
            snapshotTitle: "发布时标题",
            problem: {
              id: 3,
              title: "后来修改的标题",
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
            createdAt: new Date("2026-07-10T00:01:00.000Z"),
            caseResults: [{ caseIndex: 1, status: "Accepted" }],
          },
        ]),
      },
    };

    const result = await calculateExamScore({
      db: db as never,
      examId: 1,
      userId: 2,
    });

    expect(result.totalScore).toBe(2);
    expect(result.problemResults[0]).toMatchObject({
      maxScore: 2,
      score: 2,
      title: "发布时标题",
    });
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
