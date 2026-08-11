export type ObjectiveSubmissionResult = {
  id: number;
  status: string;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  errorMessage?: string | null;
  caseResults?: Array<{
    caseIndex: number;
    status: string;
    actualOutput: string | null;
    studentDetailsHidden?: boolean;
  }>;
};

export type ObjectiveSubmissionRefreshState = {
  countedForLearningAssignment: boolean;
  learningAssignmentDetached: boolean;
  result: ObjectiveSubmissionResult;
  savedAt: number;
};

const MAX_REFRESH_STATE_AGE_MS = 5 * 60 * 1_000;

export function createObjectiveSubmissionRefreshState({
  countedForLearningAssignment,
  learningAssignmentDetached,
  result,
  savedAt = Date.now(),
}: Omit<ObjectiveSubmissionRefreshState, "savedAt"> & { savedAt?: number }) {
  return JSON.stringify({
    countedForLearningAssignment,
    learningAssignmentDetached,
    result,
    savedAt,
  } satisfies ObjectiveSubmissionRefreshState);
}

export function parseObjectiveSubmissionRefreshState(
  value: string | null,
  now = Date.now(),
): ObjectiveSubmissionRefreshState | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ObjectiveSubmissionRefreshState>;
    if (
      !Number.isFinite(parsed.savedAt) ||
      parsed.savedAt! > now ||
      now - parsed.savedAt! > MAX_REFRESH_STATE_AGE_MS ||
      typeof parsed.countedForLearningAssignment !== "boolean" ||
      typeof parsed.learningAssignmentDetached !== "boolean" ||
      !isObjectiveSubmissionResult(parsed.result)
    ) {
      return null;
    }

    return parsed as ObjectiveSubmissionRefreshState;
  } catch {
    return null;
  }
}

function isObjectiveSubmissionResult(
  value: unknown,
): value is ObjectiveSubmissionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ObjectiveSubmissionResult>;
  return (
    Number.isInteger(result.id) &&
    typeof result.status === "string" &&
    Number.isInteger(result.passedCount) &&
    Number.isInteger(result.totalCount) &&
    Number.isFinite(result.runtimeMs) &&
    (result.caseResults === undefined ||
      (Array.isArray(result.caseResults) &&
        result.caseResults.every(
          (item) =>
            Number.isInteger(item.caseIndex) &&
            typeof item.status === "string" &&
            (item.actualOutput === null ||
              typeof item.actualOutput === "string"),
        )))
  );
}
