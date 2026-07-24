import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAcceptedProblemIds,
  getLatestAcceptedSubmissionIdsByProblem,
} from "./problemSubmissionCounts";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { submission: { findMany: mocks.findMany } },
}));

describe("accepted problem history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses any historical Accepted submission without filtering its source or type", async () => {
    mocks.findMany.mockResolvedValue([{ problemId: 2 }, { problemId: 4 }]);

    const result = await getAcceptedProblemIds({
      problemIds: [1, 2, 3, 4],
      userId: 9,
    });

    expect(result).toEqual(new Set([2, 4]));
    expect(mocks.findMany).toHaveBeenCalledWith({
      distinct: ["problemId"],
      select: { problemId: true },
      where: {
        problemId: { in: [1, 2, 3, 4] },
        status: "Accepted",
        userId: 9,
      },
    });
  });

  it("does not query when the current page is empty", async () => {
    await expect(
      getAcceptedProblemIds({ problemIds: [], userId: 9 }),
    ).resolves.toEqual(new Set());
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("keeps the newest Accepted submission for each problem", async () => {
    mocks.findMany.mockResolvedValue([
      { id: 12, problemId: 2 },
      { id: 10, problemId: 4 },
      { id: 8, problemId: 2 },
    ]);

    const result = await getLatestAcceptedSubmissionIdsByProblem({
      problemIds: [2, 4],
      userId: 9,
    });

    expect(result).toEqual(
      new Map([
        [2, 12],
        [4, 10],
      ]),
    );
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        problemId: true,
      },
      where: {
        problemId: { in: [2, 4] },
        status: "Accepted",
        userId: 9,
      },
    });
  });

  it("does not query accepted submission details for an empty problem list", async () => {
    await expect(
      getLatestAcceptedSubmissionIdsByProblem({
        problemIds: [],
        userId: 9,
      }),
    ).resolves.toEqual(new Map());
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
