export type BulkAssignmentProblem = {
  category: string;
  difficulty: string;
  id: number;
  problemType: string;
  title: string;
};

export type StudentAssignmentCustomization = {
  addedProblems: BulkAssignmentProblem[];
  removedCommonProblemIds: number[];
};

export const EMPTY_STUDENT_ASSIGNMENT_CUSTOMIZATION: StudentAssignmentCustomization = {
  addedProblems: [],
  removedCommonProblemIds: [],
};

export function reconcileStudentAssignmentCustomization(
  commonProblems: BulkAssignmentProblem[],
  customization: StudentAssignmentCustomization,
): StudentAssignmentCustomization {
  const commonIds = new Set(commonProblems.map((problem) => problem.id));
  return {
    addedProblems: customization.addedProblems.filter(
      (problem, index, items) =>
        !commonIds.has(problem.id) &&
        items.findIndex((candidate) => candidate.id === problem.id) === index,
    ),
    removedCommonProblemIds: customization.removedCommonProblemIds.filter(
      (problemId, index, ids) =>
        commonIds.has(problemId) && ids.indexOf(problemId) === index,
    ),
  };
}

export function getStudentAssignmentProblems(
  commonProblems: BulkAssignmentProblem[],
  customization: StudentAssignmentCustomization,
) {
  const reconciled = reconcileStudentAssignmentCustomization(
    commonProblems,
    customization,
  );
  const removedIds = new Set(reconciled.removedCommonProblemIds);
  return [
    ...commonProblems.filter((problem) => !removedIds.has(problem.id)),
    ...reconciled.addedProblems,
  ];
}

export function getAssignmentConflictProblems(
  problems: BulkAssignmentProblem[],
  activeProblemIds: number[],
) {
  const activeIds = new Set(activeProblemIds);
  return problems.filter((problem) => activeIds.has(problem.id));
}

export function hasStudentAssignmentCustomization(
  customization: StudentAssignmentCustomization,
) {
  return (
    customization.addedProblems.length > 0 ||
    customization.removedCommonProblemIds.length > 0
  );
}
