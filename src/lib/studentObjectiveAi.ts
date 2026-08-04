export function getStudentObjectiveAiDisplayState({
  enabled,
  hasPriorPracticeSubmission,
}: {
  enabled: boolean;
  hasPriorPracticeSubmission: boolean;
}) {
  return {
    showActions: enabled,
    showPanel: enabled && hasPriorPracticeSubmission,
  };
}
