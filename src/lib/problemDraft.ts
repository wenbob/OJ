import type { Role } from "./auth";
import type { ProblemType } from "./objectiveProblem";

export type ProblemDraftContext = {
  userId: number;
  role: Role;
} & (
  | { scope: "practice"; examId?: never }
  | { scope: "exam" | "exam-practice"; examId: number }
);

export function getProblemDraftKey(
  context: ProblemDraftContext,
  problemType: ProblemType,
  problemId: number,
) {
  return `oj:problem-draft:v2:${context.userId}:${context.role}:${context.scope}:${context.examId ?? "daily"}:${problemType}:${problemId}`;
}

export function getObjectiveResultKey(draftKey: string) {
  return `${draftKey}:submission-result`;
}

export function serializeProblemDraft(
  contextKey: string,
  content: string,
  savedAt = Date.now(),
) {
  return JSON.stringify({ version: 2, contextKey, content, savedAt });
}

export function parseProblemDraft(value: string | null, contextKey: string): string | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Record<string, unknown>;
    return draft.version === 2 &&
      draft.contextKey === contextKey &&
      typeof draft.content === "string" &&
      typeof draft.savedAt === "number" && Number.isFinite(draft.savedAt)
      ? draft.content
      : null;
  } catch {
    return null;
  }
}
