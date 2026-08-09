import { describe, expect, it, vi } from "vitest";
import {
  clearExamProblemSnapshots,
  snapshotExamProblems,
} from "./examSnapshot";

describe("exam problem snapshots", () => {
  it("copies publish-time scoring fields into immutable snapshot columns", async () => {
    const tx = {
      examProblem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 8,
            score: 12,
            problem: {
              objectiveItems: "[{\"answer\":\"A\"}]",
              problemType: "objective",
              title: "发布时题目",
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    await snapshotExamProblems(tx as never, 3);

    expect(tx.examProblem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { examId: 3, snapshotAt: null } }),
    );
    expect(tx.examProblem.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: expect.objectContaining({
        snapshotObjectiveItems: "[{\"answer\":\"A\"}]",
        snapshotProblemType: "objective",
        snapshotScore: 12,
        snapshotTitle: "发布时题目",
      }),
    });
  });

  it("clears snapshots only when an unstarted exam returns to draft", async () => {
    const tx = {
      examProblem: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    await clearExamProblemSnapshots(tx as never, 3);

    expect(tx.examProblem.updateMany).toHaveBeenCalledWith({
      where: { examId: 3 },
      data: {
        snapshotAt: null,
        snapshotObjectiveItems: null,
        snapshotProblemType: null,
        snapshotScore: null,
        snapshotTitle: null,
      },
    });
  });
});
