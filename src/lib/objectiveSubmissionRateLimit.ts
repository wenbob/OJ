type ObjectiveSubmissionScope = {
  examId: number | null;
  problemId: number;
  submissionType: string;
  userId: number;
};

const activeKeys = new Set<string>();

function scopeKey(scope: ObjectiveSubmissionScope) {
  return [
    scope.userId,
    scope.problemId,
    scope.submissionType,
    scope.examId ?? "practice",
  ].join(":");
}

export function reserveObjectiveSubmission(scope: ObjectiveSubmissionScope) {
  const key = scopeKey(scope);
  if (activeKeys.has(key)) {
    return { allowed: false as const, release() {} };
  }

  activeKeys.add(key);
  let released = false;
  return {
    allowed: true as const,
    release() {
      if (released) return;
      released = true;
      activeKeys.delete(key);
    },
  };
}

export function clearObjectiveSubmissionReservations() {
  activeKeys.clear();
}
