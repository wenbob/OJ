import { describe, expect, it } from "vitest";
import { getObjectiveResultKey, getProblemDraftKey, parseProblemDraft, serializeProblemDraft, type ProblemDraftContext } from "./problemDraft";

describe("account and scene isolated drafts", () => {
  const practice: ProblemDraftContext = { userId: 1, role: "student", scope: "practice" };
  it("isolates owners, roles, problem types, problems and exam scenes", () => {
    const keys = [
      getProblemDraftKey(practice, "programming", 10),
      getProblemDraftKey({ ...practice, userId: 2 }, "programming", 10),
      getProblemDraftKey({ ...practice, role: "teacher" }, "programming", 10),
      getProblemDraftKey(practice, "objective", 10),
      getProblemDraftKey(practice, "programming", 11),
      getProblemDraftKey({ ...practice, scope: "exam", examId: 20 }, "programming", 10),
      getProblemDraftKey({ ...practice, scope: "exam", examId: 21 }, "programming", 10),
      getProblemDraftKey({ ...practice, scope: "exam-practice", examId: 20 }, "programming", 10),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys.map(getObjectiveResultKey)).size).toBe(keys.length);
  });
  it("round trips empty answers and rejects legacy, corrupt and foreign-owner payloads", () => {
    const key = getProblemDraftKey(practice, "objective", 10);
    for (const content of ["", "A\nB", "int main() {}\n"]) {
      const value = serializeProblemDraft(key, content);
      expect(parseProblemDraft(value, key)).toBe(content);
      expect(parseProblemDraft(value, `${key}-other`)).toBeNull();
    }
    for (const value of [null, "old code", "null", "[]", "{}", '{"version":1}', "{broken"]) {
      expect(parseProblemDraft(value, key)).toBeNull();
    }
  });
});
