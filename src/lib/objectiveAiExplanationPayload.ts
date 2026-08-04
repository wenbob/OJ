export type ObjectiveAiExplanationPayload = {
  correctAnswer: string;
  generatedAt: string;
  itemIndex: number;
  model: string | null;
  options: Array<{
    explanation: string;
    isCorrect: boolean;
    label: string;
  }>;
  overview: string;
  takeaway: string;
};

export function isObjectiveAiExplanationPayload(
  value: unknown,
): value is ObjectiveAiExplanationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.itemIndex) &&
    typeof record.correctAnswer === "string" &&
    typeof record.overview === "string" &&
    typeof record.takeaway === "string" &&
    typeof record.generatedAt === "string" &&
    (typeof record.model === "string" || record.model === null) &&
    Array.isArray(record.options) &&
    record.options.every((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        return false;
      }
      const optionRecord = option as Record<string, unknown>;
      return (
        typeof optionRecord.label === "string" &&
        typeof optionRecord.isCorrect === "boolean" &&
        typeof optionRecord.explanation === "string"
      );
    })
  );
}

export function serializeObjectiveAiExplanationPayload(
  payload: ObjectiveAiExplanationPayload,
) {
  return JSON.stringify(payload);
}

export function parseObjectiveAiExplanationPayload(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isObjectiveAiExplanationPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
