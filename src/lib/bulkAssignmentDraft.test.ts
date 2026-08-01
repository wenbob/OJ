import { describe, expect, it } from "vitest";
import {
  getAssignmentConflictProblems,
  getStudentAssignmentProblems,
  reconcileStudentAssignmentCustomization,
  type BulkAssignmentProblem,
} from "./bulkAssignmentDraft";

const problems = [
  { id: 1, title: "公共一" },
  { id: 2, title: "公共二" },
  { id: 3, title: "个性题" },
].map((problem) => ({
  ...problem,
  category: "循环",
  difficulty: "入门",
  problemType: "programming",
})) satisfies BulkAssignmentProblem[];

describe("bulk assignment personalized drafts", () => {
  it("keeps common order before personalized additions", () => {
    expect(
      getStudentAssignmentProblems(problems.slice(0, 2), {
        addedProblems: [problems[2]],
        removedCommonProblemIds: [1],
      }).map((problem) => problem.id),
    ).toEqual([2, 3]);
  });

  it("drops stale removals and additions that later become common", () => {
    expect(
      reconcileStudentAssignmentCustomization(problems.slice(0, 2), {
        addedProblems: [problems[1], problems[2], problems[2]],
        removedCommonProblemIds: [1, 1, 99],
      }),
    ).toEqual({
      addedProblems: [problems[2]],
      removedCommonProblemIds: [1],
    });
  });

  it("finds only active-task conflicts in the final list", () => {
    expect(
      getAssignmentConflictProblems(problems, [2, 9]).map(
        (problem) => problem.id,
      ),
    ).toEqual([2]);
  });
});
