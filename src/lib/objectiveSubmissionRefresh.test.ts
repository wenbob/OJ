import { describe, expect, it } from "vitest";
import {
  createObjectiveSubmissionRefreshState,
  parseObjectiveSubmissionRefreshState,
} from "@/lib/objectiveSubmissionRefresh";

const result = {
  caseResults: [
    { actualOutput: "A", caseIndex: 1, status: "Accepted" },
    { actualOutput: "B", caseIndex: 2, status: "Wrong Answer" },
  ],
  id: 18,
  passedCount: 1,
  runtimeMs: 0,
  status: "Wrong Answer",
  totalCount: 2,
};

describe("objective submission refresh state", () => {
  it("restores the same per-item feedback after a server refresh", () => {
    const value = createObjectiveSubmissionRefreshState({
      countedForLearningAssignment: false,
      learningAssignmentDetached: false,
      result,
      savedAt: 1_000,
    });

    expect(parseObjectiveSubmissionRefreshState(value, 2_000)).toEqual({
      countedForLearningAssignment: false,
      learningAssignmentDetached: false,
      result,
      savedAt: 1_000,
    });
  });

  it("rejects damaged, future, and expired state", () => {
    expect(parseObjectiveSubmissionRefreshState("not-json", 2_000)).toBeNull();
    expect(
      parseObjectiveSubmissionRefreshState(
        createObjectiveSubmissionRefreshState({
          countedForLearningAssignment: false,
          learningAssignmentDetached: false,
          result,
          savedAt: 3_000,
        }),
        2_000,
      ),
    ).toBeNull();
    expect(
      parseObjectiveSubmissionRefreshState(
        createObjectiveSubmissionRefreshState({
          countedForLearningAssignment: false,
          learningAssignmentDetached: false,
          result,
          savedAt: 1_000,
        }),
        5 * 60 * 1_000 + 1_001,
      ),
    ).toBeNull();
  });
});
